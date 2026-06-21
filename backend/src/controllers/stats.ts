import { Request, Response } from 'express'
import prisma from '../utils/prisma'

export const getDashboardSummary = async (_req: Request, res: Response) => {
  try {
    const [trainings, statusCounts] = await prisma.$transaction([
      prisma.training.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          _count: { select: { participants: true } }
        }
      }),
      prisma.trainingParticipant.groupBy({
        by: ['trainingId', 'status'],
        orderBy: [{ trainingId: 'asc' }, { status: 'asc' }],
        _count: { id: true }
      })
    ])

    const countsByTraining = new Map<string, { completed: number; pending: number }>()
    for (const row of statusCounts) {
      const counts = countsByTraining.get(row.trainingId) || { completed: 0, pending: 0 }
      const count = typeof row._count === 'object' ? row._count.id || 0 : 0
      if (row.status === 'completed') counts.completed += count
      else counts.pending += count
      countsByTraining.set(row.trainingId, counts)
    }

    const summaries = trainings.map(training => {
      const counts = countsByTraining.get(training.id) || { completed: 0, pending: 0 }
      return {
        id: training.id,
        name: training.name,
        total: training._count.participants,
        completed: counts.completed,
        pending: counts.pending
      }
    })

    res.json({
      trainings: summaries,
      incomplete: summaries
        .filter(training => training.pending > 0)
        .map(training => ({ id: training.id, name: training.name, count: training.pending }))
    })
  } catch (error) {
    console.error('Get dashboard summary error:', error)
    res.status(500).json({ error: '대시보드 요약 조회 중 오류가 발생했습니다.' })
  }
}

export const getTrainingStats = async (req: Request, res: Response) => {
  try {
    const { trainingId } = req.params

    const participants = await prisma.trainingParticipant.findMany({
      where: { trainingId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            userType: true
          }
        }
      }
    })

    const total = participants.length
    const completed = participants.filter(p => p.status === 'completed').length
    const pending = total - completed

    const training = await prisma.training.findUnique({
      where: { id: trainingId }
    })

    res.json({
      training,
      total,
      completed,
      pending,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      participants
    })
  } catch (error) {
    console.error('Get training stats error:', error)
    res.status(500).json({ error: '연수 통계 조회 중 오류가 발생했습니다.' })
  }
}

export const getUserStats = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params

    const participants = await prisma.trainingParticipant.findMany({
      where: { userId },
      include: {
        training: {
          select: {
            id: true,
            name: true,
            deadline: true,
            cycle: true
          }
        }
      }
    })

    const total = participants.length
    const completed = participants.filter(p => p.status === 'completed').length
    const pending = total - completed

    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    res.json({
      user,
      total,
      completed,
      pending,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      trainings: participants
    })
  } catch (error) {
    console.error('Get user stats error:', error)
    res.status(500).json({ error: '교직원 통계 조회 중 오류가 발생했습니다.' })
  }
}

export const getIncompleteList = async (req: Request, res: Response) => {
  try {
    const { trainingId } = req.query

    const where: any = {
      status: 'pending'
    }

    if (trainingId) {
      where.trainingId = trainingId
    }

    const incompleteParticipants = await prisma.trainingParticipant.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            userType: true
          }
        },
        training: {
          select: {
            id: true,
            name: true,
            deadline: true
          }
        }
      },
      orderBy: {
        training: {
          deadline: 'asc'
        }
      }
    })

    res.json(incompleteParticipants)
  } catch (error) {
    console.error('Get incomplete list error:', error)
    res.status(500).json({ error: '미이수자 목록 조회 중 오류가 발생했습니다.' })
  }
}
