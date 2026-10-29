import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
  path: '/socket.io',
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server!: Server;

  private logger: Logger = new Logger('ChatGateway');
  private onlineUsers = new Map<string, Set<string>>();
  private socketUserMap = new Map<string, string>();
  private socketAliasesMap = new Map<string, string[]>();
  private socketRoomsMap = new Map<string, string[]>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('Chat Gateway initialized');
  }

  async handleConnection(socket: Socket) {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1] ||
      socket.handshake.query?.token;

    if (!token) {
      this.logger.warn(`Connection attempt without token: ${socket.id}`);
      socket.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.userId;
      const userRole = (payload.role || 'USER').toUpperCase();

      if (!userId) {
        this.logger.warn(`Invalid token payload: ${socket.id}`);
        socket.disconnect();
        return;
      }

      const identityAliases = await this.getPotentialUserIds(userId, userRole);
      const roomNames = this.buildRoomNames(identityAliases, userRole);
      roomNames.forEach((roomName) => socket.join(roomName));
      this.registerSocket(userId, socket.id, identityAliases, roomNames);

      this.logger.log(
        `User connected: ${userId} (${userRole}) in rooms ${roomNames.join(', ')}`,
      );

      socket.emit('connection_confirmed', {
        success: true,
        message: 'Connected to socket',
        data: {
          room: roomNames[0] ?? `${userRole}:${userId}`,
          userId,
          role: userRole,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Connection failed - Invalid token: ${error.message}`);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.unregisterSocket(socket.id);
    this.logger.log(`Socket disconnected: ${socket.id}`);
  }

  private registerSocket(
    userId: string,
    socketId: string,
    identityAliases: string[],
    roomNames: string[],
  ) {
    const aliases = Array.from(new Set([userId, ...identityAliases]));

    aliases.forEach((alias) => {
      const sockets = this.onlineUsers.get(alias) || new Set<string>();
      sockets.add(socketId);
      this.onlineUsers.set(alias, sockets);
    });

    this.socketUserMap.set(socketId, userId);
    this.socketAliasesMap.set(socketId, aliases);
    this.socketRoomsMap.set(socketId, roomNames);

    roomNames.forEach((roomName) => {
      const roomSockets = this.onlineUsers.get(roomName) || new Set<string>();
      roomSockets.add(socketId);
      this.onlineUsers.set(roomName, roomSockets);
    });
  }

  private unregisterSocket(socketId: string) {
    const userId = this.socketUserMap.get(socketId);
    const aliases =
      this.socketAliasesMap.get(socketId) ?? (userId ? [userId] : []);
    const roomNames = this.socketRoomsMap.get(socketId) ?? [];

    aliases.forEach((alias) => {
      const sockets = this.onlineUsers.get(alias);
      if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.onlineUsers.delete(alias);
        }
      }
    });

    roomNames.forEach((roomName) => {
      const roomSockets = this.onlineUsers.get(roomName);
      if (roomSockets) {
        roomSockets.delete(socketId);
        if (roomSockets.size === 0) {
          this.onlineUsers.delete(roomName);
        }
      }
    });

    this.socketUserMap.delete(socketId);
    this.socketAliasesMap.delete(socketId);
    this.socketRoomsMap.delete(socketId);
  }

  private emitToUser(userId: string | undefined, event: string, payload: any) {
    if (!userId) return;

    const sockets = this.onlineUsers.get(userId);
    if (!sockets?.size) return;

    sockets.forEach((socketId) => {
      this.server.to(socketId).emit(event, payload);
    });
  }

  private async getPotentialUserIds(
    userId?: string,
    role?: string,
  ): Promise<string[]> {
    if (!userId) return [];

    const resolvedIds = await this.chatService.getParticipantSocketIds(
      userId,
      role || '',
    );

    return Array.from(new Set([userId, ...resolvedIds]));
  }

  private buildRoomNames(userIds: string[], role?: string): string[] {
    const normalizedRole = (role || '').toUpperCase();
    const roles = new Set<string>([normalizedRole, 'USER', 'DOCTOR', 'ADMIN']);
    const rooms = new Set<string>();

    userIds.forEach((userId) => {
      Array.from(roles)
        .filter(Boolean)
        .forEach((r) => rooms.add(`${r}:${userId}`));
    });

    return Array.from(rooms);
  }

  private async getPotentialRooms(
    userId?: string,
    role?: string,
  ): Promise<string[]> {
    const userIds = await this.getPotentialUserIds(userId, role);
    return this.buildRoomNames(userIds, role);
  }

  private emitToPotentialRooms(rooms: string[], event: string, payload: any) {
    const uniqueRooms = Array.from(new Set(rooms));
    uniqueRooms.forEach((room) => {
      this.server.to(room).emit(event, payload);
    });
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      sender: { id: string; role: string };
      receiver: { id: string; role: string };
      text: string;
      images?: string[];
      video?: string;
      videoCover?: string;
      appointmentId?: string;
    },
  ) {
    this.logger.log(
      `Message from ${payload.sender.id} to ${payload.receiver.id}`,
    );

    try {
      const savedMessage = await this.chatService.saveMessage(payload);

      const receiverUserIds = await this.getPotentialUserIds(
        payload.receiver.id,
        payload.receiver.role,
      );
      const senderUserIds = await this.getPotentialUserIds(
        payload.sender.id,
        payload.sender.role,
      );
      const receiverRooms = this.buildRoomNames(
        receiverUserIds,
        payload.receiver.role,
      );
      const senderRooms = this.buildRoomNames(
        senderUserIds,
        payload.sender.role,
      );

      this.emitToPotentialRooms(receiverRooms, 'message_new', savedMessage);
      this.emitToPotentialRooms(
        receiverRooms,
        `message_new/${payload.sender.id}`,
        savedMessage,
      );
      receiverUserIds.forEach((receiverUserId) => {
        this.emitToUser(receiverUserId, 'message_new', savedMessage);
      });

      this.emitToPotentialRooms(senderRooms, 'message_new', savedMessage);
      this.emitToPotentialRooms(
        senderRooms,
        `message_new/${payload.receiver.id}`,
        savedMessage,
      );
      senderUserIds.forEach((senderUserId) => {
        this.emitToUser(senderUserId, 'message_new', savedMessage);
      });

      const conversationUpdate = await this.chatService.getConversationUpdate(
        savedMessage.conversationId.toString(),
        savedMessage,
      );

      this.emitToPotentialRooms(
        receiverRooms,
        'conversation_update',
        conversationUpdate,
      );
      receiverUserIds.forEach((receiverUserId) => {
        this.emitToUser(
          receiverUserId,
          'conversation_update',
          conversationUpdate,
        );
      });
      this.emitToPotentialRooms(
        senderRooms,
        'conversation_update',
        conversationUpdate,
      );
      senderUserIds.forEach((senderUserId) => {
        this.emitToUser(
          senderUserId,
          'conversation_update',
          conversationUpdate,
        );
      });

      this.eventEmitter.emit('chat.message.sent', {
        message: savedMessage,
        sender: payload.sender,
        receiver: payload.receiver,
      });
    } catch (error: any) {
      this.logger.error(`Error handling message: ${error.message}`);
      socket.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody()
    payload: {
      conversationId: string;
      sender: any;
      receiver: any;
    },
  ) {
    const receiverRooms = await this.getPotentialRooms(
      payload.receiver.id,
      payload.receiver.role,
    );
    this.emitToPotentialRooms(receiverRooms, 'typing', {
      conversationId: payload.conversationId,
      sender: payload.sender,
    });
  }

  @SubscribeMessage('stop_typing')
  async handleStopTyping(
    @MessageBody()
    payload: {
      conversationId: string;
      sender: any;
      receiver: any;
    },
  ) {
    const receiverRooms = await this.getPotentialRooms(
      payload.receiver.id,
      payload.receiver.role,
    );
    this.emitToPotentialRooms(receiverRooms, 'stop_typing', {
      conversationId: payload.conversationId,
      sender: payload.sender,
    });
  }

  @SubscribeMessage('mark_messages_as_read')
  async handleMarkAsRead(
    @MessageBody()
    payload: {
      conversationId: string;
      myId: string;
      myRole: string;
      senderId: string;
      senderRole: string;
    },
  ) {
    await this.chatService.markAsRead(
      payload.conversationId,
      payload.myId,
      payload.myRole,
    );

    const receiverRooms = await this.getPotentialRooms(
      payload.senderId,
      payload.senderRole,
    );
    const myRooms = await this.getPotentialRooms(payload.myId, payload.myRole);

    const update = { conversationId: payload.conversationId, seen: true };
    this.emitToPotentialRooms(receiverRooms, 'mark_messages_as_read', update);
    this.emitToPotentialRooms(myRooms, 'mark_messages_as_read', update);
  }
}
