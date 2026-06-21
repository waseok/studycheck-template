import { randomUUID } from 'crypto'

export interface ExternalParticipantInput {
  name?: string
  affiliation?: string
  position?: string
}

export const buildExternalParticipantUser = (input: ExternalParticipantInput) => {
  const name = input.name?.trim()
  const affiliation = input.affiliation?.trim()
  const position = input.position?.trim()

  if (!name) {
    throw new Error('EXTERNAL_PARTICIPANT_NAME_REQUIRED')
  }

  return {
    name,
    email: `external-${randomUUID()}@studycheck.invalid`,
    userType: affiliation || '외부 대상자',
    position: position || null,
    role: 'USER',
    isAdmin: false,
    mustSetPin: false
  }
}
