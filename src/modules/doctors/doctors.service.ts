import { Injectable } from '@nestjs/common';
import { DoctorManagementService } from './services/doctor-management.service';
import { DoctorAdminService } from './services/doctor-admin.service';
import { DoctorPublicService } from './services/doctor-public.service';
import { AddBankDetailsDto } from './dto/add-bank-details.dto';
import { AddExperienceDto } from './dto/add-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { SearchDoctorDto } from './dto/search-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(
    private readonly managementService: DoctorManagementService,
    private readonly adminService: DoctorAdminService,
    private readonly publicService: DoctorPublicService,
  ) {}

  // ---------- Doctor Profile ----------
  async createProfile(userId: string, dto: any) {
    return this.managementService.createProfile(userId, dto);
  }

  async updateProfile(userId: string, dto: any, file?: Express.Multer.File) {
    return this.managementService.updateProfile(userId, dto, file);
  }

  async getMyProfile(userId: string) {
    return this.managementService.getMyProfile(userId);
  }

  async addBankDetails(userId: string, dto: AddBankDetailsDto) {
    return this.managementService.addBankDetails(userId, dto);
  }

  async getBankDetails(userId: string) {
    return this.managementService.getBankDetails(userId);
  }

  /**
   * Lightweight lookup — returns only _id for the given userId.
   * Prefer this over getMyProfile() when only the doctor's _id is needed.
   */
  async getDoctorLean(userId: string) {
    return this.managementService.getDoctorLean(userId);
  }

  // ---------- Services ----------
  async addService(userId: string, name: string) {
    return this.managementService.addService(userId, name);
  }

  async listServices(doctorId: string) {
    return this.managementService.listServices(doctorId);
  }

  async deleteService(userId: string, serviceId: string) {
    return this.managementService.deleteService(userId, serviceId);
  }

  // ---------- Experiences ----------
  async addExperience(userId: string, dto: AddExperienceDto) {
    return this.managementService.addExperience(userId, dto);
  }

  async updateExperience(
    userId: string,
    experienceId: string,
    dto: UpdateExperienceDto,
  ) {
    return this.managementService.updateExperience(userId, experienceId, dto);
  }

  async deleteExperience(userId: string, experienceId: string) {
    return this.managementService.deleteExperience(userId, experienceId);
  }

  async listExperiences(doctorId: string) {
    return this.managementService.listExperiences(doctorId);
  }

  async uploadVerificationDocuments(
    userId: string,
    files: Record<string, Express.Multer.File[]>,
  ) {
    return this.managementService.uploadVerificationDocuments(userId, files);
  }

  async updateVerificationStatus(
    doctorId: string,
    status: string,
    note?: string,
  ) {
    return this.managementService.updateVerificationStatus(
      doctorId,
      status,
      note,
    );
  }

  async getAllDoctorsForAdmin(adminId: string, query: any) {
    return this.adminService.getAllDoctorsForAdmin(adminId, query);
  }

  async getDoctorByIdForAdmin(doctorId: string, adminId: string) {
    return this.adminService.getDoctorByIdForAdmin(doctorId, adminId);
  }

  async getPublicProfile(doctorId: string) {
    return this.publicService.getPublicProfile(doctorId);
  }

  private calculateTotalExperience(experiences: any[]): number {
    return this.managementService.calculateTotalExperience(experiences);
  }

  async getPopularDoctors(query: SearchDoctorDto) {
    return this.publicService.getPopularDoctors(query);
  }

  async getDoctorsBySpecialty(specialtyId: string, query: SearchDoctorDto) {
    return this.publicService.getDoctorsBySpecialty(query, specialtyId);
  }

  async searchDoctors(query: SearchDoctorDto) {
    return this.publicService.searchDoctors(query);
  }
}
