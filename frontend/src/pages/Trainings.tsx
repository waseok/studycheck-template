import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { getTrainings, createTraining, updateTraining, deleteTraining } from '../api/trainings'
import { isAdmin, getRole } from '../api/auth'
import { Training, User } from '../types'
import apiClient from '../api/client'

interface TrainingItem {
  content: string
  manager: string
}

const Trainings = () => {
  const navigate = useNavigate()
  const adminUser = isAdmin()
  const role = getRole()
  const isTrainingAdmin = adminUser || role === 'TRAINING_ADMIN'

  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTraining, setEditingTraining] = useState<Training | null>(null)
  const [editingItems, setEditingItems] = useState<TrainingItem[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    registrationBook: '',
    cycle: '',
    targetUsers: [] as string[],
    hours: '',
    implementationDate: '',
    department: '',
    manager: '',
    method: '',
    methodLink: '',
    deadline: ''
  })

  // 참여자 관리 관련 상태
  const [showParticipantModal, setShowParticipantModal] = useState(false)
  const [participantTraining, setParticipantTraining] = useState<Training | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [participantLoading, setParticipantLoading] = useState(false)
  const [participantSaving, setParticipantSaving] = useState(false)
  const [participantSearch, setParticipantSearch] = useState('')

  // 연수등록부 만들기 관련 상태
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerFormData, setRegisterFormData] = useState({
    name: '',
    cycle: '',
    hours: '',
    targetUsers: [] as string[],
    implementationDate: '',
    department: '',
    deadline: '',
  })
  const [trainingItems, setTrainingItems] = useState<TrainingItem[]>([
    { content: '', manager: '' }
  ])

  const userTypes = ['교원', '직원', '공무직', '기간제교사', '교육공무직', '교직원', '교육활동 참여자']

  useEffect(() => {
    fetchTrainings()
  }, [])

  const fetchTrainings = async () => {
    setLoading(true)
    try {
      const data = await getTrainings()
      setTrainings(data)
    } catch (error) {
      console.error('연수 목록 조회 오류:', error)
    } finally {
      setLoading(false)
    }
  }

  const activeTrainings = trainings.filter(t => !t.isCompleted)
  const completedTrainings = trainings.filter(t => t.isCompleted)

  // 사용자 정렬 함수
  const sortUsers = (users: User[]): User[] => {
    const typeOrder = (u: User): number => {
      if (u.role === 'SUPER_ADMIN' || u.role === 'TRAINING_ADMIN') return 0
      const t = u.userType
      if (t === '교원' || t === '기간제교사') {
        return (u.grade || u.class) ? 1 : 2
      }
      if (t === '유치원') return 3
      return 4
    }
    return [...users].sort((a, b) => {
      const oa = typeOrder(a), ob = typeOrder(b)
      if (oa !== ob) return oa - ob
      if (oa === 1) {
        const ga = parseInt(a.grade || '99') || 99
        const gb = parseInt(b.grade || '99') || 99
        if (ga !== gb) return ga - gb
        const ca = parseInt(a.class || '99') || 99
        const cb = parseInt(b.class || '99') || 99
        if (ca !== cb) return ca - cb
      }
      return a.name.localeCompare(b.name, 'ko')
    })
  }

  const handleOpenParticipantModal = async (training: Training) => {
    setParticipantTraining(training)
    setParticipantSearch('')
    setShowParticipantModal(true)
    setParticipantLoading(true)
    try {
      const [usersRes, participantsRes] = await Promise.all([
        apiClient.get<User[]>('/users'),
        apiClient.get<{ userId: string }[]>(`/participants/training/${training.id}`)
      ])
      setAllUsers(sortUsers(usersRes.data))
      const ids = new Set<string>(participantsRes.data.map((p: any) => p.userId))
      setParticipantIds(ids)
      setPendingIds(new Set(ids))
    } catch {
      alert('데이터를 불러오지 못했습니다.')
      setShowParticipantModal(false)
    } finally {
      setParticipantLoading(false)
    }
  }

  const handleToggleParticipant = (userId: string) => {
    setPendingIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleSaveParticipants = async () => {
    if (!participantTraining) return
    setParticipantSaving(true)
    try {
      const toAdd = [...pendingIds].filter(id => !participantIds.has(id))
      const toRemove = [...participantIds].filter(id => !pendingIds.has(id))

      await Promise.all([
        ...toAdd.map(userId => apiClient.post(`/participants/training/${participantTraining.id}/add`, { userId })),
        ...toRemove.map(userId => apiClient.delete(`/participants/training/${participantTraining.id}/user/${userId}`))
      ])

      setParticipantIds(new Set(pendingIds))
      fetchTrainings()
      setShowParticipantModal(false)
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setParticipantSaving(false)
    }
  }

  const handleCreate = () => {
    setEditingTraining(null)
    setEditingItems([])
    setFormData({
      name: '',
      description: '',
      registrationBook: '',
      cycle: '',
      targetUsers: [],
      hours: '',
      implementationDate: '',
      department: '',
      manager: '',
      method: '',
      methodLink: '',
      deadline: ''
    })
    setShowModal(true)
  }

  const handleEdit = (training: Training) => {
    setEditingTraining(training)
    setFormData({
      name: training.name,
      description: training.description || '',
      registrationBook: training.registrationBook || '',
      cycle: training.cycle || '',
      targetUsers: training.targetUsers || [],
      hours: training.hours || '',
      implementationDate: training.implementationDate || '',
      department: training.department || '',
      manager: training.manager || '',
      method: training.method || '',
      methodLink: training.methodLink || '',
      deadline: training.deadline ? training.deadline.split('T')[0] : ''
    })
    // 연수등록부로 만들어진 경우 항목 파싱
    if (training.registrationBook) {
      try {
        const items: TrainingItem[] = JSON.parse(training.registrationBook)
        setEditingItems(items.length > 0 ? items : [{ content: '', manager: '' }])
      } catch {
        setEditingItems([{ content: '', manager: '' }])
      }
    } else {
      setEditingItems([])
    }
    setShowModal(true)
  }

  const handleDuplicate = (training: Training) => {
    setEditingTraining(null)
    setFormData({
      name: training.name + ' 복제본',
      description: training.description || '',
      registrationBook: training.registrationBook || '',
      cycle: training.cycle || '',
      targetUsers: training.targetUsers || [],
      hours: training.hours || '',
      implementationDate: training.implementationDate || '',
      department: training.department || '',
      manager: training.manager || '',
      method: training.method || '',
      methodLink: training.methodLink || '',
      deadline: training.deadline ? training.deadline.split('T')[0] : '',
    })
    if (training.registrationBook) {
      try {
        const items: TrainingItem[] = JSON.parse(training.registrationBook)
        setEditingItems(items.length > 0 ? items : [{ content: '', manager: '' }])
      } catch {
        setEditingItems([{ content: '', manager: '' }])
      }
    } else {
      setEditingItems([])
    }
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await deleteTraining(id)
      fetchTrainings()
    } catch (error) {
      console.error('연수 삭제 오류:', error)
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  const handleComplete = async (training: Training, completed: boolean) => {
    const msg = completed ? '이 연수를 완료 처리하시겠습니까?' : '완료를 취소하시겠습니까?'
    if (!confirm(msg)) return
    try {
      await apiClient.patch(`/trainings/${training.id}/complete`, { isCompleted: completed })
      fetchTrainings()
    } catch (error: any) {
      alert(error.response?.data?.error || '처리 중 오류가 발생했습니다.')
    }
  }

  const handleTargetUserToggle = (userType: string) => {
    setFormData({
      ...formData,
      targetUsers: formData.targetUsers.includes(userType)
        ? formData.targetUsers.filter(t => t !== userType)
        : [...formData.targetUsers, userType]
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let payload: any = { ...formData }
      // 연수등록부 항목이 있으면 업데이트 (수정 및 복제 모두 처리)
      if ((editingTraining?.registrationBook || formData.registrationBook) && editingItems.length > 0) {
        const validItems = editingItems.filter(item => item.content.trim() || item.manager.trim())
        payload.registrationBook = JSON.stringify(validItems)
        if (validItems.length > 0 && !payload.manager) {
          payload.manager = validItems[0].manager
        }
      }
      if (editingTraining) {
        await updateTraining(editingTraining.id, payload)
      } else {
        await createTraining(payload)
      }
      setShowModal(false)
      fetchTrainings()
    } catch (error: any) {
      alert(error.response?.data?.error || '저장 중 오류가 발생했습니다.')
    }
  }

  // 연수등록부 만들기 핸들러
  const handleOpenRegisterModal = () => {
    setRegisterFormData({
      name: '',
      cycle: '',
      hours: '',
      targetUsers: [],
      implementationDate: '',
      department: '',
      deadline: '',
    })
    setTrainingItems([{ content: '', manager: '' }])
    setShowRegisterModal(true)
  }

  const handleRegisterTargetToggle = (userType: string) => {
    setRegisterFormData({
      ...registerFormData,
      targetUsers: registerFormData.targetUsers.includes(userType)
        ? registerFormData.targetUsers.filter(t => t !== userType)
        : [...registerFormData.targetUsers, userType]
    })
  }

  const handleAddTrainingItem = () => {
    setTrainingItems([...trainingItems, { content: '', manager: '' }])
  }

  const handleRemoveTrainingItem = (index: number) => {
    if (trainingItems.length === 1) return
    setTrainingItems(trainingItems.filter((_, i) => i !== index))
  }

  const handleTrainingItemChange = (index: number, field: 'content' | 'manager', value: string) => {
    const updated = trainingItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    )
    setTrainingItems(updated)
  }

  const handleEditingItemChange = (index: number, field: 'content' | 'manager', value: string) => {
    const updated = editingItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    )
    setEditingItems(updated)
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = trainingItems.filter(item => item.content.trim() || item.manager.trim())
    if (validItems.length === 0) {
      alert('연수 내용을 최소 1개 이상 입력해주세요.')
      return
    }
    const firstManager = validItems[0]?.manager || '담당자'
    try {
      await createTraining({
        name: registerFormData.name,
        registrationBook: JSON.stringify(validItems),
        cycle: registerFormData.cycle,
        targetUsers: registerFormData.targetUsers,
        hours: registerFormData.hours,
        implementationDate: registerFormData.implementationDate,
        department: registerFormData.department,
        manager: firstManager,
        method: '',
        methodLink: '',
        deadline: registerFormData.deadline,
      })
      setShowRegisterModal(false)
      fetchTrainings()
    } catch (error: any) {
      alert(error.response?.data?.error || '저장 중 오류가 발생했습니다.')
    }
  }

  const handleExportToExcel = async () => {
    if (trainings.length === 0) {
      alert('다운로드할 연수 목록이 없습니다.')
      return
    }
    const excelData = trainings.map((training, index) => ({
      '순번': index + 1,
      '연수명': training.name || '-',
      '연수 설명': training.description || '-',
      '대상자': training.targetUsers?.join(', ') || '-',
      '담당자': training.manager || '-',
      '업무부서': training.department || '-',
      '이수 기한': training.deadline ? new Date(training.deadline).toLocaleDateString('ko-KR') : '-',
      '이수 주기': training.cycle || '-',
      '이수시간': training.hours || '-',
      '실시일': training.implementationDate || '-',
      '참여자 수': training.participants?.length || 0,
      '등록일': training.createdAt ? new Date(training.createdAt).toLocaleDateString('ko-KR') : '-',
    }))
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, '연수 목록')
    const fileName = `연수_목록_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const TrainingRow = ({ training, completed = false }: { training: Training; completed?: boolean }) => {
    const isRegBook = !!training.registrationBook
    return (
      <tr
        key={training.id}
        className={
          completed
            ? 'bg-gray-50 opacity-70'
            : isRegBook
            ? 'bg-purple-50 hover:bg-purple-100'
            : 'hover:bg-gray-50'
        }
      >
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <div className="flex items-center gap-2">
            {isRegBook && (
              <span className="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-semibold">등록부</span>
            )}
            <button
              onClick={() => navigate(`/dashboard/trainings/${training.id}`)}
              className={`hover:underline ${completed ? 'text-gray-500 line-through' : isRegBook ? 'text-purple-700 hover:text-purple-900' : 'text-indigo-600 hover:text-indigo-900'}`}
            >
              {training.name}
            </button>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {training.targetUsers?.join(', ') || '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {training.manager || '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {training.deadline ? new Date(training.deadline).toLocaleDateString('ko-KR') : '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {(() => {
            const total = training.participants?.length || 0
            const entered = training.participants?.filter(p => p.completionNumber && p.completionNumber.trim()).length ?? 0
            return entered > 0 ? `${entered}/${total}명` : `${total}명`
          })()}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          {!completed && (
            <>
              <button
                onClick={() => navigate(`/dashboard/trainings/${training.id}`)}
                className="text-indigo-600 hover:text-indigo-900"
              >
                취합
              </button>
              <button
                onClick={() => handleOpenParticipantModal(training)}
                className="text-green-600 hover:text-green-900"
                title="참여자 추가/제거"
              >
                👥 참여자
              </button>
              {isTrainingAdmin && (
                <button
                  onClick={() => handleComplete(training, true)}
                  className="text-teal-600 hover:text-teal-900 font-semibold"
                  title="취합 완료 처리"
                >
                  ✅ 취합완료
                </button>
              )}
            </>
          )}
          <button
            onClick={() => handleDuplicate(training)}
            className="text-purple-600 hover:text-purple-900"
            title="이 연수를 복제하여 새 연수 만들기"
          >
            복제
          </button>
          <button
            onClick={() => handleEdit(training)}
            className="text-indigo-600 hover:text-indigo-900"
          >
            수정
          </button>
          {completed && isTrainingAdmin && (
            <button
              onClick={() => handleComplete(training, false)}
              className="text-gray-500 hover:text-gray-700"
            >
              완료취소
            </button>
          )}
          <button
            onClick={() => handleDelete(training.id)}
            className="text-red-600 hover:text-red-900"
          >
            삭제
          </button>
        </td>
      </tr>
    )
  }

  const tableHead = (
    <thead className="bg-gray-50">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">연수명</th>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">대상자</th>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">담당자</th>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이수 기한</th>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">참여자 수</th>
        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
      </tr>
    </thead>
  )

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">연수 관리</h1>
          <div className="flex gap-2">
            <button
              onClick={handleExportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              disabled={trainings.length === 0}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              연수 목록 다운로드
            </button>
            <button
              onClick={handleOpenRegisterModal}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
            >
              📋 연수등록부 만들기
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              연수 등록
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">로딩 중...</div>
        ) : (
          <div className="space-y-4">
            {/* 진행 중인 연수 */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                {tableHead}
                <tbody className="bg-white divide-y divide-gray-200">
                  {activeTrainings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-sm">
                        진행 중인 연수가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    activeTrainings.map((training) => (
                      <TrainingRow key={training.id} training={training} />
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* 완료 목록 (접기/펼치기) */}
            {completedTrainings.length > 0 && (
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowCompleted(v => !v)}
                  className="w-full flex items-center justify-between px-6 py-3 bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-600 transition-colors"
                >
                  <span>✅ 완료된 연수 ({completedTrainings.length}개)</span>
                  <span>{showCompleted ? '▲ 접기' : '▼ 펼치기'}</span>
                </button>
                {showCompleted && (
                  <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    {tableHead}
                    <tbody className="divide-y divide-gray-200">
                      {completedTrainings.map((training) => (
                        <TrainingRow key={training.id} training={training} completed />
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 연수 등록/수정 모달 */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full my-8">
              <h2 className="text-xl font-bold mb-4">
                {editingTraining ? '연수 수정' : '연수 등록'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">연수명 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">연수 설명</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="연수에 대한 간단한 설명을 입력하세요 (3줄 정도)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">이수 주기</label>
                    <input
                      type="text"
                      value={formData.cycle}
                      onChange={(e) => setFormData({ ...formData, cycle: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">이수시간</label>
                    <input
                      type="text"
                      value={formData.hours}
                      onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">대상자 범위 *</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {userTypes.map((type) => (
                      <label key={type} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.targetUsers.includes(type)}
                          onChange={() => handleTargetUserToggle(type)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">실시일</label>
                    <input
                      type="text"
                      value={formData.implementationDate}
                      onChange={(e) => setFormData({ ...formData, implementationDate: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">이수 기한</label>
                    <input
                      type="date"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">업무부서</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">담당자 *</label>
                    <input
                      type="text"
                      required
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* 연수등록부로 만든 경우: 연수 내용/담당자 쌍 수정 */}
                {(editingTraining?.registrationBook || formData.registrationBook) && editingItems.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-purple-700">📋 연수 내용 및 담당자 수정</label>
                      <button
                        type="button"
                        onClick={() => setEditingItems([...editingItems, { content: '', manager: '' }])}
                        className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                      >
                        + 항목 추가
                      </button>
                    </div>
                    <table className="w-full text-sm border border-gray-300 rounded" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr className="bg-purple-50">
                          <th className="border border-gray-300 px-2 py-1 text-center w-8">순번</th>
                          <th className="border border-gray-300 px-2 py-1 text-left">연수 내용</th>
                          <th className="border border-gray-300 px-2 py-1 text-center w-28">담당자</th>
                          <th className="border border-gray-300 px-2 py-1 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editingItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="border border-gray-300 px-2 py-1 text-center text-gray-500">{idx + 1}</td>
                            <td className="border border-gray-300 px-1 py-1">
                              <input
                                type="text"
                                value={item.content}
                                onChange={(e) => handleEditingItemChange(idx, 'content', e.target.value)}
                                placeholder="연수 내용 입력"
                                className="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded text-sm"
                              />
                            </td>
                            <td className="border border-gray-300 px-1 py-1">
                              <input
                                type="text"
                                value={item.manager}
                                onChange={(e) => handleEditingItemChange(idx, 'manager', e.target.value)}
                                placeholder="담당자"
                                className="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded text-sm text-center"
                              />
                            </td>
                            <td className="border border-gray-300 px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => setEditingItems(editingItems.filter((_, i) => i !== idx))}
                                disabled={editingItems.length === 1}
                                className="text-red-400 hover:text-red-600 disabled:opacity-30 text-xs"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!editingTraining?.registrationBook && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">연수자료 및 방법</label>
                      <input
                        type="text"
                        value={formData.method}
                        onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                        placeholder="예: 온라인 강의, 집합 연수 등"
                        className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">연수자료 링크</label>
                      <input
                        type="url"
                        value={formData.methodLink}
                        onChange={(e) => setFormData({ ...formData, methodLink: e.target.value })}
                        placeholder="https://example.com"
                        className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end space-x-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    저장
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* 연수등록부 만들기 모달 */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full my-8">
            <h2 className="text-xl font-bold mb-1">📋 연수등록부 만들기</h2>
            <p className="text-sm text-gray-500 mb-4">연수 내용과 담당자를 여러 개 입력할 수 있습니다.</p>
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">연수명 *</label>
                <input
                  type="text"
                  required
                  value={registerFormData.name}
                  onChange={(e) => setRegisterFormData({ ...registerFormData, name: e.target.value })}
                  placeholder="예: 2024년 2월 직무연수"
                  className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">실시일</label>
                  <input
                    type="text"
                    value={registerFormData.implementationDate}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, implementationDate: e.target.value })}
                    placeholder="예: 2024. 2. 20."
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">이수시간</label>
                  <input
                    type="text"
                    value={registerFormData.hours}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, hours: e.target.value })}
                    placeholder="예: 2시간"
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">업무부서</label>
                  <input
                    type="text"
                    value={registerFormData.department}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, department: e.target.value })}
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">이수 기한</label>
                  <input
                    type="date"
                    value={registerFormData.deadline}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, deadline: e.target.value })}
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">대상자 범위 *</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {userTypes.map((type) => (
                    <label key={type} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={registerFormData.targetUsers.includes(type)}
                        onChange={() => handleRegisterTargetToggle(type)}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 연수 내용 & 담당자 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">연수 내용 및 담당자 *</label>
                  <button
                    type="button"
                    onClick={handleAddTrainingItem}
                    className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                  >
                    + 항목 추가
                  </button>
                </div>
                <table className="w-full text-sm border border-gray-300 rounded" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-2 py-1 text-center w-8">순번</th>
                      <th className="border border-gray-300 px-2 py-1 text-left">연수 내용</th>
                      <th className="border border-gray-300 px-2 py-1 text-center w-28">담당자</th>
                      <th className="border border-gray-300 px-2 py-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="border border-gray-300 px-2 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="border border-gray-300 px-1 py-1">
                          <input
                            type="text"
                            value={item.content}
                            onChange={(e) => handleTrainingItemChange(idx, 'content', e.target.value)}
                            placeholder="연수 내용 입력"
                            className="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded text-sm"
                          />
                        </td>
                        <td className="border border-gray-300 px-1 py-1">
                          <input
                            type="text"
                            value={item.manager}
                            onChange={(e) => handleTrainingItemChange(idx, 'manager', e.target.value)}
                            placeholder="담당자"
                            className="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded text-sm text-center"
                          />
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveTrainingItem(idx)}
                            disabled={trainingItems.length === 1}
                            className="text-red-400 hover:text-red-600 disabled:opacity-30 text-xs"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 참여자 관리 모달 */}
      {showParticipantModal && participantTraining && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">👥 참여자 관리</h2>
              <p className="text-sm text-gray-500 mt-0.5">{participantTraining.name}</p>
            </div>

            <div className="px-5 pt-3">
              <input
                type="text"
                placeholder="이름 검색..."
                value={participantSearch}
                onChange={e => setParticipantSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                선택 {pendingIds.size}명 / 전체 {allUsers.length}명
                {pendingIds.size !== participantIds.size || [...pendingIds].some(id => !participantIds.has(id)) ? (
                  <span className="ml-2 text-orange-500 font-medium">· 미저장 변경사항 있음</span>
                ) : null}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {participantLoading ? (
                <div className="text-center py-8 text-gray-500">불러오는 중...</div>
              ) : (() => {
                const filtered = allUsers.filter(u =>
                  u.name.includes(participantSearch) ||
                  u.userType.includes(participantSearch) ||
                  (u.grade && u.grade.includes(participantSearch))
                )

                const groups: { label: string; users: User[] }[] = [
                  { label: '🔑 관리자', users: filtered.filter(u => u.role === 'SUPER_ADMIN' || u.role === 'TRAINING_ADMIN') },
                  { label: '🏫 교원 (학급 있음)', users: filtered.filter(u => (u.userType === '교원' || u.userType === '기간제교사') && (u.grade || u.class)) },
                  { label: '📚 교원 (학급 없음)', users: filtered.filter(u => (u.userType === '교원' || u.userType === '기간제교사') && !u.grade && !u.class) },
                  { label: '🌸 유치원', users: filtered.filter(u => u.userType === '유치원') },
                  { label: '🏢 행정실/기타', users: filtered.filter(u => !['교원', '기간제교사', '유치원'].includes(u.userType) && u.role !== 'SUPER_ADMIN' && u.role !== 'TRAINING_ADMIN') },
                ]

                return groups.map(g => g.users.length > 0 && (
                  <div key={g.label} className="mb-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase mb-1 px-1">{g.label}</div>
                    {g.users.map(u => {
                      const isIn = pendingIds.has(u.id)
                      return (
                        <button
                          key={u.id}
                          onClick={() => handleToggleParticipant(u.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                            isIn ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${
                            isIn ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {isIn ? '✓' : ''}
                          </span>
                          <span className="font-medium text-gray-900">{u.name}</span>
                          <span className="text-gray-400 text-xs">
                            {u.grade && u.class ? `${u.grade}학년 ${u.class}반` : u.grade ? `${u.grade}학년` : ''}
                            {u.position ? ` · ${u.position}` : ''}
                            {' '}{u.userType}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))
              })()}
            </div>

            <div className="p-5 border-t flex gap-2">
              <button
                onClick={() => setShowParticipantModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                닫기
              </button>
              <button
                onClick={handleSaveParticipants}
                disabled={participantSaving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {participantSaving ? '저장 중...' : `저장 (${pendingIds.size}명)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default Trainings
