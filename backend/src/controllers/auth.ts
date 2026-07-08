import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../utils/prisma'
import { verifyAdminPassword, verifySchoolPassword } from '../utils/settings'

const DEFAULT_DEV_SECRET = 'unified-dev-secret-2025'
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET

type AppRole = 'SUPER_ADMIN' | 'TRAINING_ADMIN' | 'USER'

// 초기 비밀번호로 로그인 (PIN 설정 전용)
export const loginInitial = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' })
    }

    const isValidPassword = await verifySchoolPassword(password)
    if (!isValidPassword) {
      return res.status(401).json({ error: '잘못된 초기 비밀번호입니다.' })
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ error: '등록되지 않은 이메일입니다.' })
    }

    if (user.pinHash && !user.mustSetPin) {
      return res.status(403).json({ error: '이미 PIN이 설정되었습니다. PIN으로 로그인해주세요.' })
    }

    const role: AppRole = (user.role as AppRole) || (user.isAdmin ? 'SUPER_ADMIN' : 'USER')

    const token = jwt.sign(
      { userId: user.id, email: user.email, role, isAdmin: user.isAdmin, mustSetPin: user.mustSetPin, loginTime: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      success: true,
      token,
      mustSetPin: user.mustSetPin,
      role,
      isAdmin: user.isAdmin,
      message: user.mustSetPin ? 'PIN을 설정해주세요.' : '로그인되었습니다.'
    })
  } catch (error) {
    console.error('Initial login error:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.' })
  }
}

// PIN 설정
export const setPin = async (req: Request, res: Response) => {
  try {
    const { pin } = req.body as { pin?: string }
    const userId = (req as any).user?.userId

    if (!userId) {
      return res.status(401).json({ error: '인증이 필요합니다.' })
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: '4자리 숫자 PIN을 입력해주세요.' })
    }

    const pinHash = await bcrypt.hash(pin, 10)

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        pinHash,
        mustSetPin: false
      }
    })

    const role: AppRole = (user.role as AppRole) || (user.isAdmin ? 'SUPER_ADMIN' : 'USER')

    const token = jwt.sign(
      { userId: user.id, email: user.email, role, isAdmin: user.isAdmin, mustSetPin: false, loginTime: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      success: true,
      token,
      message: 'PIN이 설정되었습니다.'
    })
  } catch (error) {
    console.error('Set PIN error:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.' })
  }
}

// PIN으로 로그인
export const loginPin = async (req: Request, res: Response) => {
  try {
    const { email, pin } = req.body as { email?: string; pin?: string }

    if (!email || !pin) {
      return res.status(400).json({ error: '이메일과 PIN을 입력해주세요.' })
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: '4자리 숫자 PIN을 입력해주세요.' })
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ error: '등록되지 않은 이메일입니다.' })
    }

    if (!user.pinHash) {
      return res.status(403).json({ error: 'PIN이 설정되지 않았습니다. 초기 비밀번호로 로그인해주세요.' })
    }

    const isValid = await bcrypt.compare(pin, user.pinHash)

    if (!isValid) {
      return res.status(401).json({ error: '잘못된 PIN입니다.' })
    }

    if (user.mustSetPin) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mustSetPin: false } as any
      })
    }

    const role: AppRole = (user.role as AppRole) || (user.isAdmin ? 'SUPER_ADMIN' : 'USER')

    const token = jwt.sign(
      { userId: user.id, email: user.email, role, isAdmin: user.isAdmin, mustSetPin: false, loginTime: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      success: true,
      token,
      role,
      isAdmin: user.isAdmin,
      mustSetPin: false,
      message: '로그인되었습니다.'
    })
  } catch (error) {
    console.error('PIN login error:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.' })
  }
}

// 관리자 로그인
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    const normalizedEmail = email && email.trim() ? email.trim() : undefined

    if (!password) {
      return res.status(400).json({ error: '비밀번호를 입력해주세요.' })
    }

    const isValidPassword = await verifyAdminPassword(password)
    if (!isValidPassword) {
      return res.status(401).json({ error: '잘못된 비밀번호입니다.' })
    }

    const role: AppRole = 'SUPER_ADMIN'
    const tokenPayload = { isAdmin: true, role, email: normalizedEmail || null, loginTime: Date.now() }

    const token = jwt.sign(
      tokenPayload,
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      success: true,
      token,
      isAdmin: true,
      role,
      message: '관리자로 로그인되었습니다.'
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.' })
  }
}

// 회원가입 (일반 사용자용)
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, userType, position, grade, class: userClass, pin } = req.body as {
      name?: string
      email?: string
      userType?: string
      position?: string
      grade?: string
      class?: string
      pin?: string
    }

    if (!name || !email) {
      return res.status(400).json({ error: '이름과 이메일은 필수입니다.' })
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: '4자리 숫자 PIN을 입력해주세요.' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    })

    if (existingUser) {
      return res.status(400).json({ error: '이미 등록된 이메일입니다.' })
    }

    const validUserTypes = ['교원', '직원', '공무직', '기간제교사', '교육공무직', '교직원', '교육활동 참여자']
    const finalUserType = userType && validUserTypes.includes(userType) ? userType : '교직원'

    const pinHash = await bcrypt.hash(pin, 10)

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        userType: finalUserType,
        position: position?.trim() || null,
        grade: grade?.trim() || null,
        class: userClass?.trim() || null,
        role: 'USER',
        isAdmin: false,
        mustSetPin: false,
        pinHash,
      } as any
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { mustSetPin: false } as any
    })

    res.json({
      success: true,
      message: '회원가입이 완료되었습니다. PIN으로 로그인해주세요.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType
      }
    })
  } catch (error: any) {
    console.error('Register error:', error)
    if (error.code === 'P2002') {
      return res.status(400).json({ error: '이미 등록된 이메일입니다.' })
    }
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' })
  }
}
