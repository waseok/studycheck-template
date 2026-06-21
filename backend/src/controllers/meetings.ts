import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { createSignatureAccessToken, verifySignatureAccessToken } from '../utils/signatureAccessToken'
import { buildExternalParticipantUser, ExternalParticipantInput } from '../utils/externalParticipant'

const prisma = new PrismaClient()

// 직위 정렬 순서 (연수등록부와 동일)
const getPositionOrder = (position: string | null, userType: string): number => {
  if (!position) {
    if (userType === '교원' || userType === '기간제교사') return 5
    return 6
  }
  const p = position.toLowerCase()
  if (p.includes('교장')) return 0
  if (p.includes('교감')) return 1
  if (p.includes('담임') || p.includes('학급')) return 2
  if (p.includes('전담') || p.includes('교과')) return 3
  if (p.includes('유치')) return 4
  if (userType === '교원' || userType === '기간제교사') return 5
  return 6
}

// 회의 목록 조회
export const getMeetings = async (_req: Request, res: Response) => {
  try {
    const meetings = await prisma.meeting.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        participants: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { signatures: true } }
      }
    })
    res.json(meetings)
  } catch (error) {
    console.error('getMeetings error:', error)
    res.status(500).json({ error: '회의 목록 조회 중 오류가 발생했습니다.' })
  }
}

// 회의 상세 조회 (참가자 + 서명 포함)
export const getMeeting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, userType: true, position: true, grade: true, class: true }
            }
          }
        },
        signatures: true
      }
    })
    if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' })

    // 서명 맵핑 + 정렬
    const signatureMap = new Map(meeting.signatures.map(s => [s.userId, s]))
    const participants = meeting.participants
      .map(p => ({
        participantId: p.id,
        userId: p.userId,
        name: p.user.name,
        userType: p.user.userType,
        position: p.user.position,
        grade: p.user.grade,
        class: p.user.class,
        signature: signatureMap.get(p.userId) ?? null
      }))
      .sort((a, b) => {
        const orderA = getPositionOrder(a.position, a.userType)
        const orderB = getPositionOrder(b.position, b.userType)
        if (orderA !== orderB) return orderA - orderB
        const gradeA = parseInt(a.grade || '0') || 0
        const gradeB = parseInt(b.grade || '0') || 0
        if (gradeA !== gradeB) return gradeA - gradeB
        const classA = parseInt(a.class || '0') || 0
        const classB = parseInt(b.class || '0') || 0
        if (classA !== classB) return classA - classB
        return a.name.localeCompare(b.name, 'ko')
      })

    res.json({
      meeting: {
        id: meeting.id,
        name: meeting.name,
        agenda: meeting.agenda,
        date: meeting.date,
        location: meeting.location,
        isCompleted: meeting.isCompleted,
        completedAt: meeting.completedAt
      },
      participants
    })
  } catch (error) {
    console.error('getMeeting error:', error)
    res.status(500).json({ error: '회의 조회 중 오류가 발생했습니다.' })
  }
}

// 회의 생성 (관리자)
export const createMeeting = async (req: Request, res: Response) => {
  try {
    const { name, agenda, date, location, participantIds } = req.body as {
      name: string
      agenda?: string
      date?: string
      location?: string
      participantIds?: string[]
    }
    const createdById = (req as any).user?.userId

    if (!name?.trim()) return res.status(400).json({ error: '회의명은 필수입니다.' })
    if (!createdById) return res.status(401).json({ error: '인증이 필요합니다.' })

    const meeting = await prisma.meeting.create({
      data: {
        name: name.trim(),
        agenda: agenda?.trim() || null,
        date: date?.trim() || null,
        location: location?.trim() || null,
        createdById,
        participants: participantIds?.length
          ? { create: participantIds.map(userId => ({ userId })) }
          : undefined
      }
    })
    res.status(201).json(meeting)
  } catch (error) {
    console.error('createMeeting error:', error)
    res.status(500).json({ error: '회의 생성 중 오류가 발생했습니다.' })
  }
}

// 회의 수정 (관리자)
export const updateMeeting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, agenda, date, location } = req.body as {
      name?: string; agenda?: string; date?: string; location?: string
    }
    const meeting = await prisma.meeting.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(agenda !== undefined && { agenda: agenda?.trim() || null }),
        ...(date !== undefined && { date: date?.trim() || null }),
        ...(location !== undefined && { location: location?.trim() || null })
      }
    })
    res.json(meeting)
  } catch (error) {
    console.error('updateMeeting error:', error)
    res.status(500).json({ error: '회의 수정 중 오류가 발생했습니다.' })
  }
}

// 회의 완료 처리 (관리자)
export const completeMeeting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { isCompleted } = req.body as { isCompleted: boolean }
    const meeting = await prisma.meeting.update({
      where: { id },
      data: {
        isCompleted: !!isCompleted,
        completedAt: isCompleted ? new Date() : null
      }
    })
    res.json(meeting)
  } catch (error) {
    console.error('completeMeeting error:', error)
    res.status(500).json({ error: '완료 처리 중 오류가 발생했습니다.' })
  }
}

// 회의 삭제 (관리자)
export const deleteMeeting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await prisma.meeting.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('deleteMeeting error:', error)
    res.status(500).json({ error: '회의 삭제 중 오류가 발생했습니다.' })
  }
}

// 참가자 추가 (관리자)
export const addParticipants = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { userIds } = req.body as { userIds: string[] }
    if (!userIds?.length) return res.status(400).json({ error: '추가할 참가자를 선택해주세요.' })

    await prisma.meetingParticipant.createMany({
      data: userIds.map(userId => ({ meetingId: id, userId })),
      skipDuplicates: true
    })
    res.json({ success: true })
  } catch (error) {
    console.error('addParticipants error:', error)
    res.status(500).json({ error: '참가자 추가 중 오류가 발생했습니다.' })
  }
}

// 교직원 명단에 없는 외부 대상자 직접 추가
export const addExternalParticipant = async (req: Request, res: Response) => {
  try {
    const { id: meetingId } = req.params
    const userData = buildExternalParticipantUser(req.body as ExternalParticipantInput)

    const participant = await prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.findUnique({ where: { id: meetingId }, select: { id: true } })
      if (!meeting) throw new Error('MEETING_NOT_FOUND')

      const user = await tx.user.create({ data: userData })
      return tx.meetingParticipant.create({
        data: { meetingId, userId: user.id },
        include: { user: true }
      })
    })

    res.status(201).json(participant)
  } catch (error) {
    if (error instanceof Error && error.message === 'EXTERNAL_PARTICIPANT_NAME_REQUIRED') {
      return res.status(400).json({ error: '이름을 입력해주세요.' })
    }
    if (error instanceof Error && error.message === 'MEETING_NOT_FOUND') {
      return res.status(404).json({ error: '회의를 찾을 수 없습니다.' })
    }
    console.error('addExternalParticipant error:', error)
    res.status(500).json({ error: '외부 대상자 추가 중 오류가 발생했습니다.' })
  }
}

// 참가자 제거 (관리자)
export const removeParticipant = async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params
    await prisma.meetingParticipant.deleteMany({ where: { meetingId: id, userId } })
    res.json({ success: true })
  } catch (error) {
    console.error('removeParticipant error:', error)
    res.status(500).json({ error: '참가자 제거 중 오류가 발생했습니다.' })
  }
}

// 서명 저장 (본인 또는 관리자 대리서명)
export const saveMeetingSignature = async (req: Request, res: Response) => {
  try {
    const { id: meetingId } = req.params
    const requestUserId = (req as any).user?.userId
    const isAdmin = (req as any).user?.isAdmin || false
    const { signatureImage, targetUserId } = req.body as { signatureImage?: string; targetUserId?: string }

    if (!requestUserId) return res.status(401).json({ error: '인증이 필요합니다.' })
    if (!signatureImage?.startsWith('data:image/')) return res.status(400).json({ error: '올바른 서명 이미지가 필요합니다.' })

    if (targetUserId && targetUserId !== requestUserId && !isAdmin) {
      return res.status(403).json({ error: '본인 서명만 작성할 수 있습니다.' })
    }
    const userId = (isAdmin && targetUserId) ? targetUserId : requestUserId

    const participant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } }
    })
    if (!participant) return res.status(403).json({ error: '해당 회의의 참가자가 아닙니다.' })

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || undefined

    const signature = await prisma.meetingSignature.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: { meetingId, userId, signatureImage, ipAddress },
      update: { signatureImage, signedAt: new Date(), ipAddress }
    })
    res.json({ success: true, signature })
  } catch (error) {
    console.error('saveMeetingSignature error:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.' })
  }
}

// 서명 삭제 (관리자)
export const deleteMeetingSignature = async (req: Request, res: Response) => {
  try {
    const { id: meetingId, userId } = req.params
    await prisma.meetingSignature.deleteMany({ where: { meetingId, userId } })
    res.json({ success: true })
  } catch (error) {
    console.error('deleteMeetingSignature error:', error)
    res.status(500).json({ error: '서명 삭제 중 오류가 발생했습니다.' })
  }
}

export const createMeetingSignatureLink = async (req: Request, res: Response) => {
  try {
    const { id: meetingId } = req.params
    const { expiresInHours } = req.body as { expiresInHours?: number }

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' })

    const normalizedHours = Math.min(168, Math.max(1, Math.floor(expiresInHours ?? 72)))

    const token = createSignatureAccessToken(
      { type: 'meeting', resourceId: meetingId },
      normalizedHours
    )

    res.json({
      token,
      expiresInHours: normalizedHours
    })
  } catch (error) {
    console.error('createMeetingSignatureLink error:', error)
    res.status(500).json({ error: '서명 링크 생성 중 오류가 발생했습니다.' })
  }
}

export const getMeetingByAccessToken = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const token = String(req.query.token || '')
    const verified = verifySignatureAccessToken(token, 'meeting', id)
    if (!verified) return res.status(401).json({ error: '유효하지 않거나 만료된 서명 링크입니다.' })

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, userType: true, position: true, grade: true, class: true } }
          }
        },
        signatures: true
      }
    })
    if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' })

    const signatureMap = new Map(meeting.signatures.map(s => [s.userId, s]))
    const participants = meeting.participants.map(p => ({
      participantId: p.id,
      userId: p.userId,
      name: p.user.name,
      userType: p.user.userType,
      position: p.user.position,
      grade: p.user.grade,
      class: p.user.class,
      signature: signatureMap.get(p.userId) ?? null
    }))

    res.json({
      meeting: {
        id: meeting.id,
        name: meeting.name,
        agenda: meeting.agenda,
        date: meeting.date,
        location: meeting.location,
        isCompleted: meeting.isCompleted,
        completedAt: meeting.completedAt
      },
      participants,
      accessUserId: verified.userId || null
    })
  } catch (error) {
    console.error('getMeetingByAccessToken error:', error)
    res.status(500).json({ error: '회의 조회 중 오류가 발생했습니다.' })
  }
}

export const saveMeetingSignatureByAccessToken = async (req: Request, res: Response) => {
  try {
    const { id: meetingId } = req.params
    const token = String(req.query.token || '')
    const { signatureImage, targetUserId } = req.body as { signatureImage?: string; targetUserId?: string }
    const verified = verifySignatureAccessToken(token, 'meeting', meetingId)
    if (!verified) return res.status(401).json({ error: '유효하지 않거나 만료된 서명 링크입니다.' })
    if (!signatureImage?.startsWith('data:image/')) {
      return res.status(400).json({ error: '올바른 서명 이미지가 필요합니다.' })
    }

    const userId = verified.userId || targetUserId
    if (!userId) return res.status(400).json({ error: '서명할 대상자 정보가 필요합니다.' })

    const participant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } }
    })
    if (!participant) return res.status(403).json({ error: '해당 회의의 참가자가 아닙니다.' })

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || undefined

    await prisma.meetingSignature.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: { meetingId, userId, signatureImage, ipAddress },
      update: { signatureImage, signedAt: new Date(), ipAddress }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('saveMeetingSignatureByAccessToken error:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.' })
  }
}
