import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EncryptionService } from 'src/common/services/encryption.service';
import {
  Doctor,
  DoctorDocument,
} from '../appointments/../doctors/schemas/doctor.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import { User } from '../users/schemas/user.schema';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<any>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  // // Resolve name + image for any participant (USER or DOCTOR)
  // private async getParticipantInfo(
  //   participantId: Types.ObjectId,
  //   role: string,
  // ): Promise<{ name: string; image: string | null }> {
  //   if (role === 'DOCTOR') {
  //     // Doctor profile holds no name — follow doctor.userId → User
  //     const doctor = (await this.doctorModel
  //       .findById(participantId)
  //       .select('userId')
  //       .lean()) as any;
  //     if (!doctor?.userId) return { name: 'Unknown', image: null };
  //     const user = (await this.userModel
  //       .findById(doctor.userId)
  //       .select('name profileImage')
  //       .lean()) as any;
  //     return {
  //       name: user?.name || 'Unknown',
  //       image: user?.profileImage || null,
  //     };
  //   }
  //   // USER / ADMIN / SUPER_ADMIN — id IS the user _id
  //   const user = (await this.userModel
  //     .findById(participantId)
  //     .select('name profileImage')
  //     .lean()) as any;
  //   return { name: user?.name || 'Unknown', image: user?.profileImage || null };
  // }

  private async getParticipantIdForRole(
    userId: string,
    role: string,
  ): Promise<string> {
    if (role.toUpperCase() === 'DOCTOR') {
      const doctorProfile = (await this.doctorModel
        .findOne({
          $or: [
            { userId: new Types.ObjectId(userId) },
            { userId: userId },
            { _id: new Types.ObjectId(userId) },
            { _id: userId as any },
          ],
        })
        .select('_id')
        .lean()) as any;
      if (doctorProfile) {
        return doctorProfile._id.toString();
      }
    }
    return userId;
  }

  async getParticipantSocketIds(
    userId: string,
    role: string,
  ): Promise<string[]> {
    if (!userId) return [];

    const ids = new Set<string>([userId]);
    const normalizedRole = (role || '').toUpperCase();

    if (normalizedRole === 'DOCTOR') {
      const doctorProfile = (await this.doctorModel
        .findOne({
          $or: [
            { userId: new Types.ObjectId(userId) },
            { userId: userId },
            { _id: new Types.ObjectId(userId) },
            { _id: userId as any },
          ],
        })
        .select('_id userId')
        .lean()) as any;

      if (doctorProfile) {
        ids.add(doctorProfile._id?.toString());
        if (doctorProfile.userId) {
          ids.add(doctorProfile.userId?.toString());
        }
      }
    }

    return Array.from(ids);
  }

  async saveMessage(payload: {
    sender: { id: string; role: string };
    receiver: { id: string; role: string };
    text: string;
    images?: string[];
    video?: string;
    videoCover?: string;
    appointmentId?: string;
  }) {
    const { sender, receiver, text, images, video, videoCover, appointmentId } =
      payload;

    if (
      sender.role.toUpperCase() === 'DOCTOR' &&
      receiver.role.toUpperCase() === 'DOCTOR'
    ) {
      throw new BadRequestException('Doctor-to-Doctor chat is not allowed');
    }

    const resolvedSenderId = await this.getParticipantIdForRole(
      sender.id,
      sender.role,
    );
    const resolvedReceiverId = await this.getParticipantIdForRole(
      receiver.id,
      receiver.role,
    );

    const senderId = new Types.ObjectId(resolvedSenderId);
    const receiverId = new Types.ObjectId(resolvedReceiverId);

    // Update payload with resolved roles if they were actually User IDs
    sender.id = resolvedSenderId;
    receiver.id = resolvedReceiverId;

    let conversation;

    // 1. Find or create conversation
    if (appointmentId) {
      const apptObjectId = new Types.ObjectId(appointmentId);
      // Priority 1: Find by appointmentId
      conversation = await this.conversationModel.findOne({
        appointmentId: apptObjectId,
      });

      if (!conversation) {
        // If not found, fetch appointment to get authoritative participant IDs
        const appointment = await this.appointmentModel
          .findById(apptObjectId)
          .lean();

        if (appointment) {
          const patientId = appointment.userId as Types.ObjectId;
          const doctorId = appointment.doctorId as Types.ObjectId;

          // Verify sender is part of this appointment
          const isPatient = patientId.toString() === sender.id;
          const isDoctor = doctorId.toString() === sender.id;

          if (isPatient || isDoctor) {
            conversation = await this.conversationModel.create({
              participants: [
                { id: patientId, role: 'USER' },
                { id: doctorId, role: 'DOCTOR' },
              ],
              appointmentId: apptObjectId,
              messages: [],
            });
          }
        }
      }
    } else {
      // If no appointmentId provided, try to find a conversation between these participants
      conversation = await this.conversationModel.findOne({
        $and: [
          { 'participants.id': senderId },
          { 'participants.id': receiverId },
        ],
      });
    }

    // Fallback or Non-appointment conversation
    if (!conversation) {
      const query: any = {
        'participants.id': {
          $all: [senderId, receiverId],
        },
        appointmentId: appointmentId ? new Types.ObjectId(appointmentId) : null,
      };

      conversation = await this.conversationModel.findOne(query);

      if (!conversation) {
        conversation = await this.conversationModel.create({
          participants: [
            { id: senderId, role: sender.role },
            { id: receiverId, role: receiver.role },
          ],
          appointmentId: appointmentId
            ? new Types.ObjectId(appointmentId)
            : (null as any),
          messages: [],
        });
      }
    }

    // 2. Encrypt message text
    const encryptedText = text ? this.encryptionService.encrypt(text) : '';

    // 3. Save message
    const newMessage = (await this.messageModel.create({
      conversationId: conversation._id,
      sender: { id: senderId, role: sender.role },
      receiver: { id: receiverId, role: receiver.role },
      text: encryptedText,
      images: images || [],
      video: video || null,
      videoCover: videoCover || null,
      seen: false,
    })) as MessageDocument;

    // 4. Update conversation
    await this.conversationModel.updateOne(
      { _id: (conversation as any)._id },
      {
        $push: { messages: newMessage._id as Types.ObjectId },
        $set: { 'meta.lastActivityAt': new Date() },
      },
    );

    return this.decryptMessage(newMessage.toObject());
  }

  async getConversationUpdate(conversationId: string, lastMessage: any) {
    const conversation = (await this.conversationModel
      .findById(new Types.ObjectId(conversationId))
      .lean()) as any;
    if (!conversation) return null;

    // Identify current user context for the update if possible,
    // but usually this is emitted to both. The receiver's perspective matters.
    // For general update, we just provide the basic structure.
    return {
      conversationId,
      participants: conversation.participants,
      lastMessage,
      updatedAt: new Date(),
    };
  }

  async markAsRead(conversationId: string, userId: string, role: string) {
    const participantId = await this.getParticipantIdForRole(userId, role);
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        'receiver.id': new Types.ObjectId(participantId),
        'receiver.role': role,
        seen: false,
      },
      { $set: { seen: true } },
    );
  }

  async decryptMessage(message: any) {
    if (message && message.text) {
      message.text = this.encryptionService.decrypt(message.text);
    }
    return message;
  }

  async getConversations(
    userId: string,
    role: string,
    appointmentId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const participantId = await this.getParticipantIdForRole(userId, role);
    const participantObjectId = new Types.ObjectId(participantId);
    const filter: any = { 'participants.id': participantObjectId };

    if (appointmentId) {
      filter.appointmentId = new Types.ObjectId(appointmentId);
    }

    const skip = (page - 1) * limit;

    // --- OLD IMPLEMENTATION (Commented out due to N+1 queries causing slow performance) ---
    // const [conversations, total] = await Promise.all([
    //   this.conversationModel
    //     .find(filter)
    //     .sort({ 'meta.lastActivityAt': -1 })
    //     .skip(skip)
    //     .limit(limit)
    //     .select('-messages')
    //     .lean(),
    //   this.conversationModel.countDocuments(filter),
    // ]);
    //
    // const formattedConversations = await Promise.all(
    //   conversations.map(async (convo: any) => {
    //     // Filter out current user
    //     const otherParticipants = convo.participants.filter(
    //       (p: any) =>
    //         p.id.toString() !== userId ||
    //         p.role.toUpperCase() !== role.toUpperCase(),
    //     );
    //
    //     // Enrich remaining participants with user details
    //     const enrichedParticipants = await Promise.all(
    //       otherParticipants.map(async (p: any) => {
    //         const userInfo = await this.userModel
    //           .findById(p.id)
    //           .select('name profileImage')
    //           .lean();
    //         return {
    //           ...p,
    //           name: userInfo?.name || 'Unknown',
    //           image: userInfo?.profileImage || null,
    //         };
    //       }),
    //     );
    //     return {
    //       ...convo,
    //       participants: enrichedParticipants,
    //     };
    //   }),
    // );
    //
    // // Get last message details separately since we excluded messages array from convo
    // const conversationIds = conversations.map((c: any) => c._id);
    // const lastMessages = await Promise.all(
    //   conversationIds.map(async (id: Types.ObjectId) => {
    //     let lastMsg = await this.messageModel
    //       .findOne({ conversationId: id })
    //       .sort({ createdAt: -1 })
    //       .lean();
    //     if (lastMsg) {
    //       lastMsg = await this.decryptMessage(lastMsg);
    //     }
    //     return { conversationId: id.toString(), lastMsg };
    //   }),
    // );
    //
    // const finalConversations = formattedConversations.map((convo: any) => {
    //   const lastMsgObj = lastMessages.find(
    //     (m) => m.conversationId === convo._id.toString(),
    //   );
    //   return {
    //     ...convo,
    //     lastMessage: lastMsgObj?.lastMsg || null,
    //   };
    // });
    //
    // return {
    //   data: finalConversations,
    //   meta: {
    //     total,
    //     page,
    //     limit,
    //     totalPages: Math.ceil(total / limit),
    //   },
    // };
    // ------------------------------------------------------------------------------------

    // ── 1. Fetch paginated conversations + total count (2 queries) ──────────
    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ 'meta.lastActivityAt': -1 })
        .skip(skip)
        .limit(limit)
        .select('-messages')
        .lean(),
      this.conversationModel.countDocuments(filter),
    ]);

    if (conversations.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    // ── 2. Collect all "other" participant IDs split by role ─────────────────
    const doctorParticipantIds: Types.ObjectId[] = [];
    const userParticipantIds: Types.ObjectId[] = [];

    for (const convo of conversations as any[]) {
      for (const p of convo.participants) {
        if (
          p.id.toString() === participantId &&
          p.role.toUpperCase() === role.toUpperCase()
        )
          continue; // skip self
        if (p.role?.toUpperCase() === 'DOCTOR') {
          doctorParticipantIds.push(p.id);
        } else {
          userParticipantIds.push(p.id);
        }
      }
    }

    // ── 3. Batch-fetch doctors (profile → userId) then their users ───────────
    const [doctorDocs, directUsers, lastMsgAgg] = await Promise.all([
      // Doctor profiles → get userId field
      doctorParticipantIds.length
        ? this.doctorModel
            .find({
              $or: [
                { _id: { $in: doctorParticipantIds } },
                { userId: { $in: doctorParticipantIds } },
                {
                  userId: {
                    $in: doctorParticipantIds.map((id) => id.toString()),
                  },
                },
                {
                  _id: {
                    $in: doctorParticipantIds.map((id) => id.toString() as any),
                  },
                },
              ],
            })
            .select('_id userId')
            .lean()
        : Promise.resolve([]),

      // Direct user lookups for USER role participants
      userParticipantIds.length
        ? this.userModel
            .find({ _id: { $in: userParticipantIds } })
            .select('_id name profileImage')
            .lean()
        : Promise.resolve([]),

      // One aggregation to get the last message per conversation
      this.messageModel.aggregate([
        {
          $match: {
            conversationId: { $in: conversations.map((c: any) => c._id) },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$conversationId',
            doc: { $first: '$$ROOT' },
          },
        },
        { $replaceRoot: { newRoot: '$doc' } },
      ]),
    ]);

    // ── 4. Fetch the actual user records for doctors ─────────────────────────
    const doctorUserIds = (doctorDocs as any[]).map((d: any) => d.userId);
    const doctorUsers =
      doctorUserIds.length > 0
        ? await this.userModel
            .find({ _id: { $in: doctorUserIds } })
            .select('_id name profileImage')
            .lean()
        : [];

    // ── 5. Build lookup Maps ─────────────────────────────────────────────────
    // doctorProfileId → { name, image }
    const doctorInfoMap = new Map<
      string,
      { name: string; image: string | null }
    >();
    const doctorUserMap = new Map(
      (doctorUsers as any[]).map((u: any) => [u._id.toString(), u]),
    );
    for (const doc of doctorDocs as any[]) {
      const userRecord = doctorUserMap.get(doc.userId?.toString());
      const info = {
        name: userRecord?.name || 'Unknown',
        image: userRecord?.profileImage || null,
      };
      doctorInfoMap.set(doc._id.toString(), info);
      if (doc.userId) {
        doctorInfoMap.set(doc.userId.toString(), info);
      }
    }

    // userId → { name, image }
    const userInfoMap = new Map(
      (directUsers as any[]).map((u: any) => [u._id.toString(), u]),
    );

    // conversationId → last message doc
    const lastMsgMap = new Map<string, any>();
    for (const msg of lastMsgAgg) {
      if (msg.text) msg.text = this.encryptionService.decrypt(msg.text);
      lastMsgMap.set(msg.conversationId.toString(), msg);
    }

    // ── 6. Assemble final response from Maps (no more DB calls) ─────────────
    const data = (conversations as any[]).map((convo) => {
      const otherParticipants = convo.participants
        .filter(
          (p: any) =>
            p.id.toString() !== participantId ||
            p.role.toUpperCase() !== role.toUpperCase(),
        )
        .map((p: any) => {
          const pid = p.id.toString();
          let name = 'Unknown';
          let image: string | null = null;

          if (p.role?.toUpperCase() === 'DOCTOR') {
            const info = doctorInfoMap.get(pid);
            if (info) ({ name, image } = info);
          } else {
            const u = userInfoMap.get(pid) as any;
            if (u) {
              name = u.name || 'Unknown';
              image = u.profileImage || null;
            }
          }
          return { ...p, name, image };
        });

      return {
        ...convo,
        participants: otherParticipants,
        lastMessage: lastMsgMap.get(convo._id.toString()) || null,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMessages(
    conversationId: string,
    userId: string,
    role: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const convoId = new Types.ObjectId(conversationId);
    const participantId = await this.getParticipantIdForRole(userId, role);

    // Check if user is part of conversation
    const conversation = (await this.conversationModel
      .findById(convoId)
      .lean()) as any;
    if (!conversation) throw new NotFoundException('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.id.toString() === participantId,
    );
    if (!isParticipant) throw new ForbiddenException('Access denied');

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: convoId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({ conversationId: convoId }),
    ]);

    // Re-sort to ascending order for frontend display if needed,
    // or keep descending. Usually, paginated fetch returns newest first.
    // However, the original code had createdAt: 1.
    // For pagination, we almost always want createdAt: -1 to get the LATEST messages.

    const decryptedMessages = messages.map((m: any) => {
      if (m.text) {
        m.text = this.encryptionService.decrypt(m.text);
      }
      return m;
    });

    // ── Resolve recipient (the other participant from the caller's perspective) ─
    let recipient: any = null;
    try {
      const other = conversation.participants.find(
        (p: any) => p.id.toString() !== participantId,
      );
      if (other) {
        if (other.role?.toUpperCase() === 'DOCTOR') {
          const doc = (await this.doctorModel
            .findById(other.id)
            .select('_id userId')
            .lean()) as any;
          if (doc?.userId) {
            const u = (await this.userModel
              .findById(doc.userId)
              .select('name profileImage')
              .lean()) as any;
            recipient = {
              id: doc._id,
              userId: doc.userId,
              role: 'DOCTOR',
              name: u?.name || 'Unknown',
              image: u?.profileImage || null,
            };
          }
        } else {
          const u = (await this.userModel
            .findById(other.id)
            .select('name profileImage')
            .lean()) as any;
          if (u) {
            recipient = {
              id: u._id,
              role: 'USER',
              name: u.name || 'Unknown',
              image: u.profileImage || null,
            };
          }
        }
      }
    } catch {
      recipient = null;
    }

    return {
      recipient,
      data: decryptedMessages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMessagesByUser(
    targetUserId: string,
    userId: string,
    role: string,
    page: number = 1,
    limit: number = 50,
  ) {
    // Resolve the caller's participant ID (returns doctor profile _id for DOCTOR role)
    const participantId = await this.getParticipantIdForRole(userId, role);

    // Resolve the target's participant ID (handles both: patient userId OR doctor userId/profileId)
    const maybeDoctor = (await this.doctorModel
      .findOne({
        $or: [
          { userId: new Types.ObjectId(targetUserId) },
          { userId: targetUserId },
          { _id: new Types.ObjectId(targetUserId) },
          { _id: targetUserId as any },
        ],
      })
      .select('_id userId')
      .lean()) as any;

    let targetParticipantId = targetUserId;
    let targetRole = 'USER';
    if (maybeDoctor) {
      targetParticipantId = maybeDoctor._id.toString();
      targetRole = 'DOCTOR';
    }

    // Search for an existing conversation containing both participants (no appointmentId filter)
    let conversation: any = await this.conversationModel.findOne({
      'participants.id': {
        $all: [
          new Types.ObjectId(participantId),
          new Types.ObjectId(targetParticipantId),
        ],
      },
    });

    // If not found, create a new conversation
    if (!conversation) {
      conversation = await this.conversationModel.create({
        participants: [
          { id: new Types.ObjectId(participantId), role },
          { id: new Types.ObjectId(targetParticipantId), role: targetRole },
        ],
        messages: [],
      });
    }

    // ── Build recipient info: always the OTHER person from the caller's perspective ──
    let recipient: any = null;
    try {
      if (targetRole === 'DOCTOR') {
        // Target is a doctor → get their user record via doctor profile
        const doc =
          maybeDoctor ||
          ((await this.doctorModel
            .findById(new Types.ObjectId(targetParticipantId))
            .select('_id userId')
            .lean()) as any);
        if (doc?.userId) {
          const u = (await this.userModel
            .findById(doc.userId)
            .select('name profileImage')
            .lean()) as any;
          recipient = {
            id: doc._id,
            userId: doc.userId,
            role: 'DOCTOR',
            name: u?.name || 'Unknown',
            image: u?.profileImage || null,
          };
        }
      } else {
        // Target is a patient/user
        const u = (await this.userModel
          .findById(new Types.ObjectId(targetParticipantId))
          .select('name profileImage')
          .lean()) as any;
        if (u) {
          recipient = {
            id: u._id,
            role: 'USER',
            name: u.name || 'Unknown',
            image: u.profileImage || null,
          };
        }
      }
    } catch {
      recipient = null;
    }

    const result = await this.getMessages(
      (conversation as any)._id.toString(),
      userId,
      role,
      page,
      limit,
    );

    // Exclude recipient from result spread — we already built it above with richer context
    const { recipient: _ignored, ...rest } = result;

    return {
      conversationId: (conversation as any)._id,
      recipient,
      ...rest,
    };
  }

  // async getMessagesByAppointment(
  //   appointmentId: string,
  //   userId: string,
  //   role: string,
  //   page: number = 1,
  //   limit: number = 50,
  // ) {
  //   const apptObjectId = new Types.ObjectId(appointmentId);
  //
  //   // Find or auto-create conversation for this appointment
  //   let conversation = (await this.conversationModel
  //     .findOne({ appointmentId: apptObjectId })
  //     .lean()) as any;
  //
  //   if (!conversation) {
  //     // Look up appointment to find both participants
  //     const appointment = (await this.appointmentModel
  //       .findById(apptObjectId)
  //       .lean()) as any;
  //
  //     if (!appointment) {
  //       throw new NotFoundException('Appointment not found');
  //     }
  //
  //     // Determine roles: userId is always patient, doctorId is always doctor
  //     const patientId = appointment.userId as Types.ObjectId;
  //     const doctorId = appointment.doctorId as Types.ObjectId;
  //
  //     // Verify caller is a participant in this appointment
  //     const isPatient = patientId.toString() === userId;
  //     const isDoctor = doctorId.toString() === userId;
  //     if (!isPatient && !isDoctor) {
  //       throw new ForbiddenException('You are not a participant in this chat');
  //     }
  //
  //     // Auto-create an empty conversation so conversationId is available
  //     conversation = await this.conversationModel.create({
  //       participants: [
  //         { id: patientId, role: 'USER' },
  //         { id: doctorId, role: 'DOCTOR' },
  //       ],
  //       appointmentId: apptObjectId,
  //       messages: [],
  //     });
  //
  //     // Build recipient info for the chat header
  //     const otherId = isPatient ? doctorId : patientId;
  //     const otherRole = isPatient ? 'DOCTOR' : 'USER';
  //     const recipientInfo = await this.getParticipantInfo(otherId, otherRole);
  //
  //     return {
  //       conversationId: (conversation as any)._id,
  //       recipient: {
  //         id: otherId,
  //         role: otherRole,
  //         name: recipientInfo.name,
  //         image: recipientInfo.image,
  //       },
  //       data: [],
  //       meta: {
  //         total: 0,
  //         page,
  //         limit,
  //         totalPages: 0,
  //       },
  //     };
  //   }
  //
  //   // Check if user is part of the existing conversation
  //   const isParticipant = conversation.participants.some(
  //     (p: any) => p.id.toString() === userId,
  //   );
  //
  //   if (!isParticipant) {
  //     throw new ForbiddenException('You are not a participant in this chat');
  //   }
  //
  //   // Build recipient info (the other participant in the conversation)
  //   const otherParticipant = conversation.participants.find(
  //     (p: any) => p.id.toString() !== userId,
  //   );
  //
  //   const recipientInfo = otherParticipant
  //     ? await this.getParticipantInfo(
  //         otherParticipant.id,
  //         otherParticipant.role,
  //       )
  //     : null;
  //
  //   const recipient = otherParticipant
  //     ? {
  //         id: otherParticipant.id,
  //         role: otherParticipant.role,
  //         name: recipientInfo?.name || 'Unknown',
  //         image: recipientInfo?.image || null,
  //       }
  //     : null;
  //
  //   // Fetch messages for the existing conversation
  //   const result = await this.getMessages(
  //     (conversation as any)._id.toString(),
  //     userId,
  //     role,
  //     page,
  //     limit,
  //   );
  //
  //   return {
  //     conversationId: (conversation as any)._id,
  //     recipient,
  //     ...result,
  //   };
  // }

  async findAll(
    userId: string,
    role: string,
    appointmentId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    return this.getConversations(userId, role, appointmentId, page, limit);
  }
}
