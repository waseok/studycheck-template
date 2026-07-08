import apiClient from './client'
import axios from 'axios'

export interface MeetingSignatureInfo {
  id: string
  signatureImage: string
  signedAt: string
}

export interface MeetingParticipant {
  participantId: string
  userId: string
  name: string
  userType: string
  position: string | null
  grade: string | null
  class: string | null
  signature: MeetingSignatureInfo | null
}

export interface Meeting {
  id: string
  name: string
  agenda: string | null
  date: string | null
  location: string | null
  isCompleted: boolean
  completedAt: string | null
  participants: { id: string; user: { id: string; name: string } }[]
  _count?: { signatures: number }
}

export interface MeetingDetail {
  meeting: {
    id: string
    name: string
    agenda: string | null
    date: string | null
    location: string | null
    isCompleted: boolean
    completedAt: string | null
  }
  participants: MeetingParticipant[]
}

export interface PublicMeetingDetail extends MeetingDetail {
  accessUserId: string | null
}

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const getMeetings = async (): Promise<Meeting[]> => {
  const response = await apiClient.get<Meeting[]>('/meetings')
  return response.data
}

export const getMeeting = async (id: string): Promise<MeetingDetail> => {
  const response = await apiClient.get<MeetingDetail>(`/meetings/${id}`)
  return response.data
}

export const createMeeting = async (data: {
  name: string
  agenda?: string
  date?: string
  location?: string
  participantIds?: string[]
}): Promise<Meeting> => {
  const response = await apiClient.post<Meeting>('/meetings', data)
  return response.data
}

export const updateMeeting = async (id: string, data: {
  name?: string
  agenda?: string
  date?: string
  location?: string
}): Promise<Meeting> => {
  const response = await apiClient.put<Meeting>(`/meetings/${id}`, data)
  return response.data
}

export const completeMeeting = async (id: string, isCompleted: boolean): Promise<Meeting> => {
  const response = await apiClient.put<Meeting>(`/meetings/${id}/complete`, { isCompleted })
  return response.data
}

export const deleteMeeting = async (id: string): Promise<void> => {
  await apiClient.delete(`/meetings/${id}`)
}

export const addMeetingParticipants = async (meetingId: string, userIds: string[]): Promise<void> => {
  await apiClient.post(`/meetings/${meetingId}/participants`, { userIds })
}

export const addExternalMeetingParticipant = async (
  meetingId: string,
  data: { name: string; affiliation?: string; position?: string }
): Promise<void> => {
  await apiClient.post(`/meetings/${meetingId}/participants/external`, data)
}

export const removeMeetingParticipant = async (meetingId: string, userId: string): Promise<void> => {
  await apiClient.delete(`/meetings/${meetingId}/participants/${userId}`)
}

export const saveMeetingSignature = async (
  meetingId: string,
  signatureImage: string,
  targetUserId?: string
): Promise<{ success: boolean }> => {
  const response = await apiClient.post(`/meetings/${meetingId}/signature`, { signatureImage, targetUserId })
  return response.data
}

export const deleteMeetingSignature = async (meetingId: string, userId: string): Promise<void> => {
  await apiClient.delete(`/meetings/${meetingId}/signature/${userId}`)
}

export const createMeetingSignatureShareLink = async (
  meetingId: string,
  expiresInHours = 72
): Promise<{ token: string }> => {
  const response = await apiClient.post(`/meetings/${meetingId}/share-link`, { expiresInHours })
  return response.data
}

export const getPublicMeeting = async (meetingId: string, token: string): Promise<PublicMeetingDetail> => {
  const response = await axios.get<PublicMeetingDetail>(`${API_URL}/meetings/public/${meetingId}`, {
    params: { token }
  })
  return response.data
}

export const savePublicMeetingSignature = async (
  meetingId: string,
  token: string,
  signatureImage: string,
  targetUserId?: string
): Promise<{ success: boolean }> => {
  const response = await axios.post<{ success: boolean }>(
    `${API_URL}/meetings/public/${meetingId}/signature`,
    { signatureImage, targetUserId },
    { params: { token } }
  )
  return response.data
}
