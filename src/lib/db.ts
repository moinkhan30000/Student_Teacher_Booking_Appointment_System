
import { db } from "@/lib/firebase";
import { z } from "zod";
import { collection, Timestamp } from "firebase/firestore";


export type UserDoc = {
  displayName: string;
  email: string;
  roles: string[];        
  approved: boolean;      
  department?: string;
  subject?: string;
};

export type TeacherDoc = {
  name: string;
  department: string;
  subject: string;
  bio?: string;
  office?: string;
  active: boolean;
};

export type AppointmentStatus = "pending" | "approved" | "cancelled";

export type AppointmentDoc = {
  teacherId: string;
  studentId: string;
  startAt: Timestamp;
  endAt: Timestamp;
  status: AppointmentStatus;
  note?: string;
  createdAt?: Timestamp;
};

export type MessageDoc = {
  fromUid: string;
  toUid: string;
  text: string;
  createdAt: Timestamp;
};

export type LogDoc = {
  at: Timestamp;
  uid: string;
  action: string;
  meta: Record<string, any>;
};


export const UserSchema = z.object({
  displayName: z.string().default(""),
  email: z.string().email(),
  roles: z.array(z.string()).default([]),
  approved: z.boolean().default(false),
  department: z.string().optional(),
  subject: z.string().optional(),
});

export const TeacherSchema = z.object({
  name: z.string(),
  department: z.string(),
  subject: z.string(),
  bio: z.string().optional(),
  office: z.string().optional(),
  active: z.boolean(),
});

export const AppointmentSchema = z.object({
  teacherId: z.string(),
  studentId: z.string(),
  startAt: z.any(), 
  endAt: z.any(),
  status: z.enum(["pending", "approved", "cancelled"]),
  note: z.string().optional(),
  createdAt: z.any().optional(),
});

export const MessageSchema = z.object({
  fromUid: z.string(),
  toUid: z.string(),
  text: z.string().min(1),
  createdAt: z.any(),
});

export const LogSchema = z.object({
  at: z.any(),
  uid: z.string(),
  action: z.string(),
  meta: z.record(z.string(), z.any()),
});


export const colUsers        = collection(db, "users");
export const colTeachers     = collection(db, "teachers");
export const colAppointments = collection(db, "appointments");
export const colMessages     = collection(db, "messages");
export const colLogs         = collection(db, "logs");
