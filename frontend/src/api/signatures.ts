import apiClient from './client'
import axios from 'axios'

export const getSavedSignature = async (): Promise<string | null> => {
  const response = await apiClient.get<{ savedSignature: string | null }>('/users/me/saved-signature')
  return response.data.savedSignature
}

export const saveSavedSignature = async (signatureImage: string | null): Promise<void> => {
  await apiClient.put('/users/me/saved-signature', { signatureImage })
}

export interface SignatureInfo {
  id: string
  signatureImage: string
  signedAt: string
}

export interface SignatureParticipant {
  participantId: string
  userId: string
  name: string
  userType: string
  position: string | null
  grade: string | null
  class: string | null
  signature: SignatureInfo | null
}

export interface SignatureBookData {
  training: {
    id: string
    name: string
    department: string | null
    manager: string
    implementationDate: string | null
    hours: string | null
    registrationBook: string | null
  }
  participants: SignatureParticipant[]
}

export interface PublicSignatureBookData extends SignatureBookData {
  accessUserId: string | null
}

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const getSignatureBook = async (trainingId: string): Promise<SignatureBookData> => {
  const response = await apiClient.get<SignatureBookData>(`/signatures/training/${trainingId}`)
  return response.data
}

export const saveSignature = async (trainingId: string, signatureImage: string, targetUserId?: string): Promise<{ success: boolean }> => {
  const response = await apiClient.post(`/signatures/training/${trainingId}`, { signatureImage, targetUserId })
  return response.data
}

export const deleteSignature = async (trainingId: string, userId: string): Promise<{ success: boolean }> => {
  const response = await apiClient.delete(`/signatures/training/${trainingId}/user/${userId}`)
  return response.data
}

export const syncSignatureStatus = async (trainingId: string): Promise<{ updated: number }> => {
  const response = await apiClient.post(`/signatures/training/${trainingId}/sync-status`)
  return response.data
}

export const createTrainingSignatureShareLink = async (
  trainingId: string,
  expiresInHours = 72
): Promise<{ token: string }> => {
  const response = await apiClient.post(`/signatures/training/${trainingId}/share-link`, { expiresInHours })
  return response.data
}

export const getPublicSignatureBook = async (trainingId: string, token: string): Promise<PublicSignatureBookData> => {
  const response = await axios.get<PublicSignatureBookData>(`${API_URL}/signatures/public/training/${trainingId}`, {
    params: { token }
  })
  return response.data
}

export const savePublicSignature = async (
  trainingId: string,
  token: string,
  signatureImage: string,
  targetUserId?: string
): Promise<{ success: boolean }> => {
  const response = await axios.post<{ success: boolean }>(`${API_URL}/signatures/public/training/${trainingId}`, { signatureImage, targetUserId }, {
    params: { token }
  })
  return response.data
}
