import apiClient from './client'
import { TrainingParticipant } from '../types'

export const getParticipants = async (trainingId: string): Promise<TrainingParticipant[]> => {
  const response = await apiClient.get<TrainingParticipant[]>(`/participants/training/${trainingId}`)
  return response.data
}

export const getMyTrainings = async (): Promise<TrainingParticipant[]> => {
  const response = await apiClient.get<TrainingParticipant[]>('/participants/my-trainings')
  return response.data
}

export const updateCompletionNumber = async (
  id: string,
  completionNumber: string
): Promise<TrainingParticipant> => {
  const response = await apiClient.put<TrainingParticipant>(`/participants/${id}/completion-number`, {
    completionNumber
  })
  return response.data
}

export const cancelCompletion = async (id: string): Promise<TrainingParticipant> => {
  const response = await apiClient.put<TrainingParticipant>(`/participants/${id}/cancel-completion`)
  return response.data
}

export const cleanupDuplicates = async (): Promise<{ success: boolean; message: string; deletedCount?: number; duplicateGroups?: number }> => {
  const response = await apiClient.post<{ success: boolean; message: string; deletedCount?: number; duplicateGroups?: number }>('/participants/cleanup-duplicates')
  return response.data
}

export const addTrainingParticipant = async (trainingId: string, userId: string): Promise<TrainingParticipant> => {
  const response = await apiClient.post<TrainingParticipant>(`/participants/training/${trainingId}/add`, { userId })
  return response.data
}

export const addExternalTrainingParticipant = async (
  trainingId: string,
  data: { name: string; affiliation?: string; position?: string }
): Promise<TrainingParticipant> => {
  const response = await apiClient.post<TrainingParticipant>(`/participants/training/${trainingId}/add-external`, data)
  return response.data
}

export const removeTrainingParticipant = async (trainingId: string, userId: string): Promise<void> => {
  await apiClient.delete(`/participants/training/${trainingId}/user/${userId}`)
}
