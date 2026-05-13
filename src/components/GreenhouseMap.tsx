import { useEffect, useMemo, useState } from "react"
import { Check, Filter, Lock, Trash2, TriangleAlert, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Tables, TablesInsert } from "@/types/supabase"

type Bed = Tables<"beds">
type Task = Tables<"tasks">
type TaskDefinition = Tables<"task_definitions">
type TaskInsert = TablesInsert<"tasks">
type TaskType = Task["task_type"]
type TaskStatus = Task["status"]
type AssignmentMode = "planned" | "unplanned"

type GreenhouseMapProps = {
  greenhouseId: string
  rows: number
  columns: number
}

type FilterState = {
  taskTypes: TaskType[]
  statuses: TaskStatus[]
  createdDate: string
  completedDate: string
}

type LastAssignedBatch = {
  count: number
  createdAt: string
  mode: AssignmentMode
  taskName: string
}

type SummaryByTask = {
  cancelled: number
  completed: number
  name: string
  pending: number
  total: number
  uniqueBeds: number
  unplanned: number
}

type CompletionDraft = {
  manualDateTime: string
  task: Task
  useCurrentTime: boolean
}

type CancellationDraft = {
  reason: string
  task: Task
}

const taskLabels: Record<TaskType, string> = {
  cortar: "Cortar",
  fertilizar: "Fertilizar",
  quimicos: "Quimicos",
  poscosecha: "Poscosecha"
}

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pendientes",
  completed: "Cumplidas",
  cancelled: "Canceladas"
}

const createDefaultFilters = (): FilterState => ({
  taskTypes: [],
  statuses: [],
  createdDate: "",
  completedDate: ""
})

const formatDateTime = (date: string) => {
  const parsedDate = new Date(date)

  const day = parsedDate.getDate()
  const month = parsedDate.toLocaleString("es-CO", { month: "long" })
  const time = parsedDate.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })

  return `${day} de ${month} a las ${time}`
}

const getWeekFromToday = () => {
  const today = new Date()
  const day = today.getDay()

  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  start.setDate(today.getDate() - day)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    end_date: end.toISOString(),
    start_date: start.toISOString()
  }
}

const getLocalDateOnly = (value: string | null) => {
  if (!value) return ""

  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const getWeekRangeFromStart = (startDate: string) => {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    end_date: end.toISOString(),
    start_date: start.toISOString()
  }
}

const getWeekStartDate = (value: string) => {
  const date = new Date(value)
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(date.getDate() - date.getDay())

  return start.toISOString().split("T")[0]
}

const getDateTimeInputValue = (value: string) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const toggleArrayValue = <T extends string>(items: T[], value: T) =>
  items.includes(value)
    ? items.filter(item => item !== value)
    : [...items, value]

const buildBedTaskMap = (items: Task[]) => {
  const map = new Map<string, Task[]>()

  items.forEach(task => {
    if (!task.bed_id) return

    const current = map.get(task.bed_id) ?? []
    map.set(task.bed_id, [...current, task])
  })

  return map
}

const getTaskWeekStart = (task: Task) => {
  if (task.week_start) {
    return task.week_start.split("T")[0]
  }

  return getWeekStartDate(task.created_at)
}

const getTaskDisplayName = (task: Task) =>
  task.task_name?.trim() || taskLabels[task.task_type]

const isMissingDatabaseFeatureError = (error: unknown) => {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : ""

  return (
    /column .* does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /Could not find the table/i.test(message) ||
    /schema cache/i.test(message)
  )
}

const getMigrationErrorMessage = (feature: string) =>
  `No se puede usar ${feature} porque falta aplicar la migracion nueva de Supabase.`

const mergeTasksById = (current: Task[], incoming: Task[]) => {
  const map = new Map<string, Task>()

  current.forEach(task => {
    map.set(task.id, task)
  })

  incoming.forEach(task => {
    map.set(task.id, task)
  })

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

const updateTaskById = (current: Task[], updatedTask: Task) =>
  current.map(task => (task.id === updatedTask.id ? updatedTask : task))

export default function GreenhouseMap({
  greenhouseId,
  rows,
  columns
}: GreenhouseMapProps) {
  const { user, role } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [currentWeek, setCurrentWeek] = useState(getWeekFromToday())
  const [selectedBeds, setSelectedBeds] = useState(new Set<string>())
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [taskType, setTaskType] = useState<TaskType>("cortar")
  const [taskName, setTaskName] = useState(taskLabels.cortar)
  const [selectedTaskDefinitionId, setSelectedTaskDefinitionId] = useState<string | null>(
    null
  )
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("planned")
  const [notes, setNotes] = useState("")
  const [mode, setMode] = useState<"view" | "select">("view")
  const [isDragging, setIsDragging] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedBedDetail, setSelectedBedDetail] = useState<{
    bedKey: string
    tasks: Task[]
  } | null>(null)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [selectedChemical, setSelectedChemical] = useState<string | null>(null)
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskType, setNewTaskType] = useState<TaskType>("cortar")
  const [newTaskPermanent, setNewTaskPermanent] = useState(false)
  const [migrationWarning, setMigrationWarning] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(createDefaultFilters)
  const [draftFilters, setDraftFilters] = useState<FilterState>(createDefaultFilters)
  const [autoAdjustedWeek, setAutoAdjustedWeek] = useState(false)
  const [lastAssignedBatch, setLastAssignedBatch] = useState<LastAssignedBatch | null>(null)
  const [completionDraft, setCompletionDraft] = useState<CompletionDraft | null>(null)
  const [cancellationDraft, setCancellationDraft] = useState<CancellationDraft | null>(null)
  const [deleteTaskDefinitionId, setDeleteTaskDefinitionId] = useState<string | null>(null)

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth
  const cellSize = Math.max(18, Math.min(45, (viewportWidth * 0.7) / columns))
  const middleRow = Math.floor(rows / 2)
  const weekStart = currentWeek.start_date.split("T")[0]
  const weekEnd = currentWeek.end_date.split("T")[0]

  const getWeekStatus = () => {
    const today = new Date()
    const todayStart = new Date(today)
    todayStart.setHours(0, 0, 0, 0)
    todayStart.setDate(today.getDate() - today.getDay())

    const selectedStart = new Date(currentWeek.start_date)
    selectedStart.setHours(0, 0, 0, 0)

    if (selectedStart < todayStart) return "past"
    if (selectedStart > todayStart) return "future"
    return "current"
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "short"
    })

  const registerSchemaWarning = (feature: string, error: unknown) => {
    if (!isMissingDatabaseFeatureError(error)) {
      console.error(error)
      return
    }

    setMigrationWarning(current =>
      current ?? getMigrationErrorMessage(feature)
    )
  }

  const { data: beds = [] } = useQuery({
    queryKey: ["beds", greenhouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds")
        .select("*")
        .eq("greenhouse_id", greenhouseId)
        .limit(20000)

      if (error) {
        console.error("Error beds:", error)
        return []
      }

      return (data ?? []) as Bed[]
    }
  })

  const { data: currentWeekData } = useQuery({
    queryKey: ["week", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weeks")
        .select("*")
        .eq("start_date", weekStart)
        .maybeSingle()

      if (error) {
        registerSchemaWarning("la planeacion semanal", error)
        return null
      }

      return data
    }
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", greenhouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("greenhouse_id", greenhouseId)
        .order("created_at", { ascending: false })
        .limit(100000)

      if (error) {
        console.error("Error tasks:", error)
        return []
      }

      return (data ?? []) as Task[]
    }
  })

  const { data: taskDefinitions = [] } = useQuery({
    queryKey: ["task-definitions", greenhouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_definitions")
        .select("*")
        .or(`greenhouse_id.is.null,greenhouse_id.eq.${greenhouseId}`)
        .order("name", { ascending: true })

      if (error) {
        registerSchemaWarning("las tareas personalizadas", error)
        return []
      }

      return (data ?? []) as TaskDefinition[]
    }
  })

  const { data: chemicals = [] } = useQuery({
    queryKey: ["chemicals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chemicals")
        .select("*")
        .eq("available", true)
        .order("name", { ascending: true })

      if (error) {
        console.error("Error chemicals:", error)
        return []
      }

      return data ?? []
    }
  })

  const weekStatus = getWeekStatus()
  const isExplicitlyLocked = currentWeekData?.is_locked ?? false
  const isWeekLocked = isExplicitlyLocked || weekStatus !== "future"
  const canScheduleTasks = role === "admin" || role === "engineer"
  const canFreezeWeek = canScheduleTasks && weekStatus === "future" && !isExplicitlyLocked
  const canCreateTaskDefinitions = canScheduleTasks
  const canRegisterUnplanned = (role === "admin" || role === "supervisor") && weekStatus === "current"
  const canCompleteTasks = (role === "admin" || role === "supervisor") && weekStatus === "current"
  const canCancelTasks = role === "admin" || role === "engineer"

  const bedMap = useMemo(() => {
    const map = new Map<string, string>()
    beds.forEach(bed => {
      map.set(`${bed.row_number}-${bed.column_number}`, bed.id)
    })
    return map
  }, [beds])

  const chemicalMap = useMemo(() => {
    const map = new Map<string, string>()
    chemicals.forEach(chemical => {
      map.set(chemical.id, chemical.name)
    })
    return map
  }, [chemicals])

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
      if (error) return []
      return data ?? []
    }
  })

  const profileMap = useMemo(() => {
    const map = new Map<string, string>()
    profiles.forEach(p => {
      if (p.user_id) map.set(p.user_id, p.full_name ?? "Usuario")
    })
    return map
  }, [profiles])

  const availableTaskDefinitions = useMemo(
    () =>
      taskDefinitions.filter(taskDefinition => {
        if (taskDefinition.is_permanent) return true

        const start = taskDefinition.start_week?.split("T")[0] ?? weekStart
        const end = taskDefinition.end_week?.split("T")[0] ?? weekStart

        return weekStart >= start && weekStart <= end
      }),
    [taskDefinitions, weekStart]
  )

  const currentWeekTasks = useMemo(
    () =>
      tasks.filter(task => {
        const taskWeek = getTaskWeekStart(task)
        return taskWeek === weekStart
      }),
    [tasks, weekStart]
  )

  const currentWeekBedTaskMap = useMemo(
    () => buildBedTaskMap(currentWeekTasks),
    [currentWeekTasks]
  )

  const hasActiveFilters = useMemo(
    () =>
      filters.taskTypes.length > 0 ||
      filters.statuses.length > 0 ||
      Boolean(filters.createdDate) ||
      Boolean(filters.completedDate),
    [filters]
  )

  const shouldSearchAllTasks =
    Boolean(filters.createdDate) || Boolean(filters.completedDate)

  const filteredTasks = useMemo(() => {
    const sourceTasks = shouldSearchAllTasks ? tasks : currentWeekTasks

    return sourceTasks.filter(task => {
      if (
        filters.taskTypes.length > 0 &&
        !filters.taskTypes.includes(task.task_type)
      ) {
        return false
      }

      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(task.status)
      ) {
        return false
      }

      if (
        filters.createdDate &&
        getLocalDateOnly(task.created_at) !== filters.createdDate
      ) {
        return false
      }

      if (
        filters.completedDate &&
        getLocalDateOnly(task.completed_at) !== filters.completedDate
      ) {
        return false
      }

      return true
    })
  }, [currentWeekTasks, filters, shouldSearchAllTasks, tasks])

  const visibleTasks = hasActiveFilters ? filteredTasks : currentWeekTasks
  const visibleBedTaskMap = useMemo(
    () => buildBedTaskMap(visibleTasks),
    [visibleTasks]
  )

  const visibleBedIds = useMemo(
    () =>
      new Set(
        visibleTasks
          .map(task => task.bed_id)
          .filter((bedId): bedId is string => Boolean(bedId))
      ),
    [visibleTasks]
  )

  useEffect(() => {
    if (autoAdjustedWeek || tasks.length === 0 || currentWeekTasks.length > 0) {
      return
    }

    const latestTask = [...tasks].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]

    if (!latestTask) {
      setAutoAdjustedWeek(true)
      return
    }

    setCurrentWeek(getWeekRangeFromStart(getTaskWeekStart(latestTask)))
    setAutoAdjustedWeek(true)
  }, [autoAdjustedWeek, currentWeekTasks.length, tasks])

  useEffect(() => {
    const stopDragging = () => setIsDragging(false)

    window.addEventListener("mouseup", stopDragging)
    return () => window.removeEventListener("mouseup", stopDragging)
  }, [])

  const summary = useMemo(() => {
    const totalTasks = visibleTasks.length
    const completed = visibleTasks.filter(task => task.status === "completed").length
    const pending = visibleTasks.filter(task => task.status === "pending").length
    const cancelled = visibleTasks.filter(task => task.status === "cancelled").length
    const bedsWithTasks = new Set(
      visibleTasks
        .map(task => task.bed_id)
        .filter((bedId): bedId is string => Boolean(bedId))
    ).size

    return {
      bedsWithTasks,
      cancelled,
      completed,
      pending,
      totalTasks
    }
  }, [visibleTasks])

  const summaryByTask = useMemo<SummaryByTask[]>(() => {
    const map = new Map<
      string,
      Omit<SummaryByTask, "uniqueBeds"> & { beds: Set<string> }
    >()

    visibleTasks.forEach(task => {
      const name = getTaskDisplayName(task)
      const current =
        map.get(name) ?? {
          beds: new Set<string>(),
          cancelled: 0,
          completed: 0,
          name,
          pending: 0,
          total: 0,
          unplanned: 0
        }

      current.total += 1
      current[currentStatusKey(task.status)] += 1
      if (task.is_unplanned) current.unplanned += 1
      if (task.bed_id) current.beds.add(task.bed_id)

      map.set(name, current)
    })

    return Array.from(map.values())
      .map(item => ({
        cancelled: item.cancelled,
        completed: item.completed,
        name: item.name,
        pending: item.pending,
        total: item.total,
        uniqueBeds: item.beds.size,
        unplanned: item.unplanned
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"))
  }, [visibleTasks])

  const activeFilterBadges = useMemo(() => {
    const badges: string[] = []

    filters.taskTypes.forEach(type => {
      badges.push(taskLabels[type])
    })

    if (filters.statuses.length > 0) {
      badges.push(filters.statuses.map(status => statusLabels[status]).join(" + "))
    }

    if (filters.createdDate) {
      badges.push(`Creadas: ${filters.createdDate}`)
    }

    if (filters.completedDate) {
      badges.push(`Realizadas: ${filters.completedDate}`)
    }

    return badges
  }, [filters])

  const activeFilterCount = activeFilterBadges.length

  const getColor = (taskList: Task[]) => {
    if (taskList.length === 0) return "bg-white"

    const nonCancelled = taskList.filter(task => task.status !== "cancelled")

    if (nonCancelled.length === 0) return "bg-slate-300"

    if (nonCancelled.every(task => task.status === "completed")) {
      return "bg-green-500"
    }

    if (nonCancelled.some(task => task.is_unplanned && task.status !== "completed")) {
      return "bg-red-500"
    }

    return "bg-orange-400"
  }

  const openFiltersModal = () => {
    setDraftFilters(filters)
    setFiltersOpen(true)
  }

  const applyFilters = () => {
    setFilters(draftFilters)
    setFiltersOpen(false)
  }

  const clearFilters = () => {
    const emptyFilters = createDefaultFilters()
    setDraftFilters(emptyFilters)
    setFilters(emptyFilters)
    setFiltersOpen(false)
  }

  const openAssignDialog = (next: {
    mode: AssignmentMode
    taskDefinitionId?: string | null
    taskName: string
    taskType: TaskType
  }) => {
    setTaskType(next.taskType)
    setTaskName(next.taskName)
    setSelectedTaskDefinitionId(next.taskDefinitionId ?? null)
    setAssignmentMode(next.mode)
    setSelectedBeds(new Set())
    setMode("view")
    setNotes("")
    setSelectedChemical(null)
    setAssignDialogOpen(true)
  }

  const ensureWeekRecord = async (locked: boolean) => {
    const { data, error } = await supabase
      .from("weeks")
      .upsert(
        {
          end_date: weekEnd,
          is_locked: locked,
          start_date: weekStart
        },
        { onConflict: "start_date" }
      )
      .select("*")
      .maybeSingle()

    if (error) throw error

    return data
  }

  const changeWeek = (direction: number) => {
    setAutoAdjustedWeek(true)
    setCurrentWeek(prev => {
      const base = new Date(prev.start_date)
      const newStart = new Date(base)
      newStart.setDate(base.getDate() + direction * 7)

      const newEnd = new Date(newStart)
      newEnd.setDate(newStart.getDate() + 6)

      return {
        end_date: newEnd.toISOString(),
        start_date: newStart.toISOString()
      }
    })
  }

  const lockWeekMutation = useMutation({
    mutationFn: async () => {
      if (!canFreezeWeek) {
        throw new Error("Solo el jefe de area o el administrador pueden congelar semanas futuras.")
      }

      try {
        await ensureWeekRecord(true)
      } catch (error) {
        if (isMissingDatabaseFeatureError(error)) {
          throw new Error(getMigrationErrorMessage("el congelamiento semanal"))
        }

        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["week", weekStart] })
      toast({ title: "Semana congelada" })
    },
    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const assignMutation = useMutation({
    mutationFn: async (assignToAll: boolean) => {
      if (!user) {
        throw new Error("No hay una sesion activa para asignar tareas.")
      }

      if (assignmentMode === "planned") {
        if (!canScheduleTasks) {
          throw new Error("Solo el jefe de area o el administrador pueden programar tareas.")
        }

        if (isWeekLocked) {
          throw new Error("La semana ya esta congelada y no admite nueva planeacion.")
        }
      }

      if (assignmentMode === "unplanned" && !canRegisterUnplanned) {
        throw new Error("Solo el supervisor o el administrador pueden registrar imprevistos en la semana actual.")
      }

      if (taskType === "quimicos" && !selectedChemical) {
        throw new Error("Debes seleccionar un quimico.")
      }

      if (!assignToAll && selectedBeds.size === 0) {
        throw new Error("Selecciona al menos una cama.")
      }

      let weekRecord: Tables<"weeks"> | null = null

      try {
        weekRecord = await ensureWeekRecord(
          assignmentMode === "planned" ? isExplicitlyLocked : true
        )
      } catch (error) {
        // Week record is supplementary — never block task assignment because of it
        console.warn("Week record skipped:", error)
      }

      const createdAt = new Date().toISOString()
      const baseInsert = {
        assigned_by: user.id,
        chemical_id: taskType === "quimicos" ? selectedChemical : null,
        created_at: createdAt,
        greenhouse_id: greenhouseId,
        is_unplanned: assignmentMode === "unplanned",
        notes: notes.trim() || null,
        task_definition_id: selectedTaskDefinitionId,
        task_name: taskName,
        task_type: taskType,
        week_id: weekRecord?.id ?? null,
        week_start: weekStart
      }

      let inserts: TaskInsert[] = []

      if (assignToAll) {
        inserts = beds.map(bed => ({
          ...baseInsert,
          bed_id: bed.id
        }))
      } else {
        inserts = Array.from(selectedBeds)
          .map(key => {
            const bedId = bedMap.get(key)
            if (!bedId) return null

            return {
              ...baseInsert,
              bed_id: bedId
            }
          })
          .filter(Boolean) as TaskInsert[]
      }

      const insertTasksBatched = async (payload: TaskInsert[]): Promise<number> => {
        const BATCH = 200
        const TIMEOUT_MS = 15000

        for (let i = 0; i < payload.length; i += BATCH) {
          const batch = payload.slice(i, i + BATCH)

          const batchPromise = supabase.from("tasks").insert(batch).then(({ error }) => {
            if (error) throw error
          })

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("La conexion tardo demasiado. Verifica tu internet e intenta de nuevo.")),
              TIMEOUT_MS
            )
          )

          await Promise.race([batchPromise, timeoutPromise])
        }

        return payload.length
      }

      try {
        return await insertTasksBatched(inserts)
      } catch (error) {
        if (!isMissingDatabaseFeatureError(error)) {
          throw error
        }

        const legacyInserts = inserts.map(insert => ({
          assigned_by: insert.assigned_by,
          bed_id: insert.bed_id,
          chemical_id: insert.chemical_id,
          created_at: insert.created_at,
          greenhouse_id: insert.greenhouse_id,
          is_unplanned: insert.is_unplanned,
          notes: insert.notes,
          task_type: insert.task_type,
          week_id: insert.week_id,
          week_start: insert.week_start
        }))

        return await insertTasksBatched(legacyInserts)
      }
    },
    onSuccess: (count: number) => {
      queryClient.refetchQueries({ queryKey: ["tasks", greenhouseId] })
      queryClient.invalidateQueries({ queryKey: ["week", weekStart] })
      queryClient.invalidateQueries({ queryKey: ["pending-tasks"] })
      queryClient.invalidateQueries({ queryKey: ["all-tasks-stats"] })

      setLastAssignedBatch({
        count,
        createdAt: new Date().toISOString(),
        mode: assignmentMode,
        taskName
      })

      setSelectedBeds(new Set())
      setMode("view")
      setAssignDialogOpen(false)
      setNotes("")
      setSelectedChemical(null)

      toast({
        title:
          assignmentMode === "planned"
            ? "Tarea programada"
            : "Imprevisto registrado"
      })
    },
    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const completeMutation = useMutation({
    mutationFn: async (input: { completedAt: string; task: Task }) => {
      if (!user) {
        throw new Error("No hay una sesion activa para cerrar la tarea.")
      }

      const { data, error } = await supabase
        .from("tasks")
        .update({
          completed_at: input.completedAt,
          completed_by: user.id,
          status: "completed"
        })
        .eq("id", input.task.id)
        .select("*")
        .single()

      if (error) throw error

      return data as Task
    },
    onSuccess: updatedTask => {
      queryClient.setQueryData<Task[]>(["tasks", greenhouseId], current =>
        updateTaskById(current ?? [], updatedTask)
      )
      queryClient.invalidateQueries({ queryKey: ["tasks", greenhouseId] })
      queryClient.invalidateQueries({ queryKey: ["pending-tasks"] })
      queryClient.invalidateQueries({ queryKey: ["all-tasks-stats"] })
      setCompletionDraft(null)
      toast({ title: "Tarea cerrada" })
    },
    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const cancelMutation = useMutation({
    mutationFn: async (input: { reason: string; task: Task }) => {
      if (!user) {
        throw new Error("No hay una sesion activa para cancelar la tarea.")
      }

      const { data, error } = await supabase
        .from("tasks")
        .update({
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancelled_reason: input.reason.trim() || null,
          status: "cancelled"
        })
        .eq("id", input.task.id)
        .select("*")
        .single()

      if (error) {
        if (isMissingDatabaseFeatureError(error)) {
          throw new Error(getMigrationErrorMessage("la cancelacion de tareas"))
        }

        throw error
      }

      return data as Task
    },
    onSuccess: updatedTask => {
      queryClient.setQueryData<Task[]>(["tasks", greenhouseId], current =>
        updateTaskById(current ?? [], updatedTask)
      )
      queryClient.invalidateQueries({ queryKey: ["tasks", greenhouseId] })
      queryClient.invalidateQueries({ queryKey: ["pending-tasks"] })
      queryClient.invalidateQueries({ queryKey: ["all-tasks-stats"] })
      setCancellationDraft(null)
      toast({ title: "Tarea cancelada" })
    },
    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const createTaskDefinitionMutation = useMutation({
    mutationFn: async () => {
      if (!newTaskName.trim()) {
        throw new Error("Ponle nombre a la tarea.")
      }

      const { error } = await supabase.from("task_definitions").insert({
        end_week: newTaskPermanent ? null : weekStart,
        greenhouse_id: greenhouseId,
        is_permanent: newTaskPermanent,
        name: newTaskName.trim(),
        start_week: newTaskPermanent ? null : weekStart,
        task_type: newTaskType
      })

      if (error) {
        if (isMissingDatabaseFeatureError(error)) {
          throw new Error(getMigrationErrorMessage("las tareas personalizadas"))
        }

        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["task-definitions", greenhouseId]
      })
      setCreateTaskOpen(false)
      setNewTaskName("")
      setNewTaskType("cortar")
      setNewTaskPermanent(false)
      toast({ title: "Tarea creada" })
    },
    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const deleteTaskDefinitionMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canCreateTaskDefinitions) {
        throw new Error("Solo el jefe de area o el administrador pueden eliminar tareas.")
      }

      const { error } = await supabase
        .from("task_definitions")
        .delete()
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-definitions", greenhouseId] })
      setDeleteTaskDefinitionId(null)
      toast({ title: "Tarea eliminada del panel" })
    },
    onError: (error: Error) => {
      console.error(error)
      toast({ title: "Error", description: error.message })
    }
  })

  const toggleBedSelection = (key: string) => {
    setSelectedBeds(prev => {
      const next = new Set(prev)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  const openBedDetail = (key: string) => {
    const bedId = bedMap.get(key)
    const fullList = bedId ? currentWeekBedTaskMap.get(bedId) ?? [] : []
    const filteredList = bedId ? visibleBedTaskMap.get(bedId) ?? [] : []
    const list = hasActiveFilters ? filteredList : fullList

    if (bedId && list.length > 0) {
      setSelectedBedDetail({ bedKey: key, tasks: list })
      setDetailOpen(true)
    }
  }

  const handleCompleteSubmit = () => {
    if (!completionDraft) return

    if (!completionDraft.useCurrentTime && !completionDraft.manualDateTime) {
      toast({
        title: "Error",
        description: "Selecciona una fecha y hora para cerrar la tarea."
      })
      return
    }

    const completedAt = completionDraft.useCurrentTime
      ? new Date().toISOString()
      : new Date(completionDraft.manualDateTime).toISOString()

    completeMutation.mutate({
      completedAt,
      task: completionDraft.task
    })
  }

  return (
    <div>
      {migrationWarning && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {migrationWarning}
        </div>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-stretch">
        <div className="flex min-h-[88px] items-center justify-between gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm">
          <Button onClick={() => changeWeek(-1)} type="button">
            ←
          </Button>

          <div className="flex-1 text-center">
            <h2 className="text-lg font-bold">Semana</h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(currentWeek.start_date)} → {formatDate(currentWeek.end_date)}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Badge variant={weekStatus === "future" ? "default" : "secondary"}>
                {weekStatus === "future"
                  ? "Planeacion"
                  : weekStatus === "current"
                  ? "Ejecucion"
                  : "Historico"}
              </Badge>
              {isExplicitlyLocked && (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Congelada
                </Badge>
              )}
            </div>
          </div>

          <Button onClick={() => changeWeek(1)} type="button">
            →
          </Button>
        </div>

        {canFreezeWeek && (
          <Button
            type="button"
            variant="outline"
            className="h-auto gap-2 px-5 py-4"
            onClick={() => lockWeekMutation.mutate()}
            disabled={lockWeekMutation.isPending}
          >
            <Lock className="h-4 w-4" />
            {lockWeekMutation.isPending ? "Congelando..." : "Congelar semana"}
          </Button>
        )}

        <Button
          type="button"
          variant={hasActiveFilters ? "default" : "outline"}
          className="h-auto gap-2 px-5 py-4 lg:min-w-40"
          onClick={openFiltersModal}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {hasActiveFilters ? (
          <>
            {activeFilterBadges.map(filterLabel => (
              <Badge key={filterLabel} variant="outline" className="gap-1">
                {filterLabel}
              </Badge>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Abre filtros para ocultar camas y resumentes sin borrar informacion.
          </p>
        )}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          className={cn(
            "rounded border p-3 text-sm",
            weekStatus === "future" && !isExplicitlyLocked && "border-emerald-200 bg-emerald-50 text-emerald-900",
            weekStatus === "current" && "border-amber-200 bg-amber-50 text-amber-900",
            weekStatus === "past" && "border-slate-200 bg-slate-50 text-slate-700",
            isExplicitlyLocked && weekStatus === "future" && "border-red-200 bg-red-50 text-red-700"
          )}
        >
          {weekStatus === "future" && !isExplicitlyLocked && (
            <p>Semana abierta para planeacion. Cuando termines, congelala para bloquear cambios.</p>
          )}
          {weekStatus === "future" && isExplicitlyLocked && (
            <p>La semana futura ya quedo congelada. Solo se puede consultar hasta que inicie la ejecucion.</p>
          )}
          {weekStatus === "current" && (
            <p>
              La semana esta en ejecucion. Ya no se modifica la planeacion, pero el supervisor y el administrador
              pueden registrar imprevistos y cerrar tareas.
            </p>
          )}
          {weekStatus === "past" && (
            <p>Vista historica. Solo consulta de lo planeado y el resultado final.</p>
          )}
        </div>

        <div className="rounded border bg-white p-3 text-sm shadow-sm">
          <p className="mb-2 font-semibold">
            {hasActiveFilters ? "Resumen filtrado" : "Resumen semanal"}
          </p>
          <div className="space-y-1">
            <p>Camas con tareas: {summary.bedsWithTasks}</p>
            <p>Total tareas: {summary.totalTasks}</p>
            <p>Cumplidas: {summary.completed}</p>
            <p>Pendientes: {summary.pending}</p>
            <p>Canceladas: {summary.cancelled}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full space-y-4 lg:w-72">
          {canScheduleTasks && weekStatus === "future" && !isExplicitlyLocked && (
            <div className="space-y-3 rounded border bg-white p-3 shadow-sm">
              <p className="font-semibold">Programar tareas</p>
              {Object.entries(taskLabels).map(([key, label]) => (
                <button
                  key={`planned-${key}`}
                  type="button"
                  onClick={() =>
                    openAssignDialog({
                      mode: "planned",
                      taskName: label,
                      taskType: key as TaskType
                    })
                  }
                  className="w-full rounded border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  {label}
                </button>
              ))}

              {availableTaskDefinitions.map(taskDefinition => (
                <div key={`planned-definition-${taskDefinition.id}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      openAssignDialog({
                        mode: "planned",
                        taskDefinitionId: taskDefinition.id,
                        taskName: taskDefinition.name,
                        taskType: taskDefinition.task_type
                      })
                    }
                    className="flex flex-1 items-center justify-between gap-2 rounded border bg-slate-50 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100"
                  >
                    <span>{taskDefinition.name}</span>
                    {!taskDefinition.is_permanent && (
                      <Badge variant="secondary" className="shrink-0 text-xs">Temporal</Badge>
                    )}
                  </button>
                  {canCreateTaskDefinitions && (
                    <button
                      type="button"
                      title="Eliminar del panel"
                      onClick={() => setDeleteTaskDefinitionId(taskDefinition.id)}
                      className="rounded border p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canRegisterUnplanned && (
            <div className="space-y-3 rounded border border-orange-200 bg-orange-50 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <TriangleAlert className="h-4 w-4 text-orange-600" />
                <p className="font-semibold text-orange-900">Registrar imprevistos</p>
              </div>
              {Object.entries(taskLabels).map(([key, label]) => (
                <button
                  key={`unplanned-${key}`}
                  type="button"
                  onClick={() =>
                    openAssignDialog({
                      mode: "unplanned",
                      taskName: label,
                      taskType: key as TaskType
                    })
                  }
                  className="w-full rounded border border-orange-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-orange-100"
                >
                  {label}
                </button>
              ))}

              {availableTaskDefinitions.map(taskDefinition => (
                <div key={`unplanned-definition-${taskDefinition.id}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      openAssignDialog({
                        mode: "unplanned",
                        taskDefinitionId: taskDefinition.id,
                        taskName: taskDefinition.name,
                        taskType: taskDefinition.task_type
                      })
                    }
                    className="flex flex-1 items-center justify-between gap-2 rounded border border-orange-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-orange-100"
                  >
                    <span>{taskDefinition.name}</span>
                    {!taskDefinition.is_permanent && (
                      <Badge variant="secondary" className="shrink-0 text-xs">Temporal</Badge>
                    )}
                  </button>
                  {canCreateTaskDefinitions && (
                    <button
                      type="button"
                      title="Eliminar del panel"
                      onClick={() => setDeleteTaskDefinitionId(taskDefinition.id)}
                      className="rounded border border-orange-200 p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canCreateTaskDefinitions && (
            <Button
              type="button"
              onClick={() => setCreateTaskOpen(true)}
              className="w-full"
              variant="outline"
            >
              + Nueva tarea
            </Button>
          )}

          {lastAssignedBatch && (
            <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Ultima asignacion</p>
              <p>{lastAssignedBatch.taskName}</p>
              <p>
                {lastAssignedBatch.count} cama{lastAssignedBatch.count === 1 ? "" : "s"} ·{" "}
                {lastAssignedBatch.mode === "planned" ? "Planeada" : "Imprevisto"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(lastAssignedBatch.createdAt)}
              </p>
            </div>
          )}

          <div className="rounded border bg-white p-3 text-sm shadow-sm">
            <p className="mb-2 font-semibold">Resumen por tarea</p>
            {summaryByTask.length === 0 ? (
              <p className="text-muted-foreground">Sin tareas para esta vista.</p>
            ) : (
              <div className="space-y-2">
                {summaryByTask.map(item => (
                  <div key={item.name} className="rounded border p-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.uniqueBeds} camas · {item.total} tareas
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.pending} pendientes · {item.completed} cumplidas · {item.cancelled} canceladas
                    </p>
                    {item.unplanned > 0 && (
                      <p className="text-xs text-orange-700">{item.unplanned} imprevisto(s)</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded border bg-white p-3 text-xs text-muted-foreground shadow-sm">
            <p className="mb-2 font-semibold text-foreground">Colores del mapa</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded border bg-white" />
                Sin tareas
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded border bg-orange-400" />
                Tarea pendiente
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded border bg-red-500" />
                Imprevisto pendiente
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded border bg-green-500" />
                Ejecutada
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded border bg-slate-300" />
                Solo canceladas
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded border bg-white p-2 shadow-sm">
          {Array.from({ length: rows }).map((_, rowIndex) => {
            if (rowIndex === middleRow) {
              return (
                <div key="camino" className="mb-1 rounded bg-gray-200 py-1 text-center text-sm">
                  Camino
                </div>
              )
            }

            return (
              <div key={rowIndex} className="mb-1 flex gap-1">
                {Array.from({ length: columns }).map((_, columnIndex) => {
                  const key = `${rowIndex + 1}-${columnIndex + 1}`
                  const bedId = bedMap.get(key)
                  const fullList = bedId ? currentWeekBedTaskMap.get(bedId) ?? [] : []
                  const filteredList = bedId ? visibleBedTaskMap.get(bedId) ?? [] : []
                  const displayList = hasActiveFilters ? filteredList : fullList
                  const matchesFilters = bedId ? visibleBedIds.has(bedId) : false
                  const hiddenByFilter = hasActiveFilters && !matchesFilters

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={hiddenByFilter}
                      onClick={() => {
                        if (mode === "view") {
                          openBedDetail(key)
                        }
                      }}
                      onMouseDown={event => {
                        if (mode === "select" && event.button === 0) {
                          setIsDragging(true)
                          toggleBedSelection(key)
                        }
                      }}
                      onMouseEnter={() => {
                        if (isDragging && mode === "select") {
                          toggleBedSelection(key)
                        }
                      }}
                      style={{ height: cellSize, width: cellSize }}
                      className={cn(
                        "rounded border transition-all",
                        getColor(displayList),
                        hiddenByFilter &&
                          "border-transparent bg-transparent opacity-10 shadow-none",
                        matchesFilters &&
                          hasActiveFilters &&
                          "ring-2 ring-sky-500 ring-offset-1",
                        selectedBeds.has(key) && "ring-2 ring-black ring-offset-1"
                      )}
                      title={key}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filtros del mapa</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-medium">Ver camas con esta tarea especifica</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(taskLabels).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded border p-3 text-sm"
                  >
                    <Checkbox
                      checked={draftFilters.taskTypes.includes(key as TaskType)}
                      onCheckedChange={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          taskTypes: toggleArrayValue(prev.taskTypes, key as TaskType)
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Estado de la tarea</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(statusLabels) as TaskStatus[]).map(status => (
                  <label
                    key={status}
                    className="flex items-center gap-2 rounded border p-3 text-sm"
                  >
                    <Checkbox
                      checked={draftFilters.statuses.includes(status)}
                      onCheckedChange={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          statuses: toggleArrayValue(prev.statuses, status)
                        }))
                      }
                    />
                    <span>{statusLabels[status]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="created-date">Tareas creadas el dia</Label>
                <Input
                  id="created-date"
                  type="date"
                  value={draftFilters.createdDate}
                  onChange={event =>
                    setDraftFilters(prev => ({
                      ...prev,
                      createdDate: event.target.value
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="completed-date">Tareas realizadas el dia</Label>
                <Input
                  id="completed-date"
                  type="date"
                  value={draftFilters.completedDate}
                  onChange={event =>
                    setDraftFilters(prev => ({
                      ...prev,
                      completedDate: event.target.value
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpiar todo
              </Button>
              <Button type="button" onClick={applyFilters}>
                Aplicar filtros
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignmentMode === "planned" ? "Programar tarea" : "Registrar imprevisto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{taskName}</p>
              <p className="text-muted-foreground">
                Tipo: {taskLabels[taskType]} · Semana {formatDate(currentWeek.start_date)} →{" "}
                {formatDate(currentWeek.end_date)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-notes">Notas</Label>
              <Input
                id="assign-notes"
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Notas de la tarea"
              />
            </div>

            {taskType === "quimicos" && (
              <div className="space-y-2">
                <Label>Quimico</Label>
                <Select
                  value={selectedChemical ?? ""}
                  onValueChange={value => setSelectedChemical(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona quimico" />
                  </SelectTrigger>
                  <SelectContent>
                    {chemicals.map(chemical => (
                      <SelectItem key={chemical.id} value={chemical.id}>
                        {chemical.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => assignMutation.mutate(true)}
                disabled={assignMutation.isPending}
              >
                {assignMutation.isPending ? "Guardando..." : "Todas"}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={assignMutation.isPending}
                onClick={() => {
                  setMode("select")
                  setAssignDialogOpen(false)
                }}
              >
                Manual
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {mode === "select" && selectedBeds.size > 0 && (
        <div className="fixed bottom-6 right-6 z-50 rounded border bg-white p-4 shadow">
          <p className="text-sm">{selectedBeds.size} camas seleccionadas</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={() => assignMutation.mutate(false)}
              disabled={assignMutation.isPending || selectedBeds.size === 0}
            >
              {assignMutation.isPending ? "Guardando..." : "Confirmar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedBeds(new Set())
                setMode("view")
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalle {selectedBedDetail ? `de cama ${selectedBedDetail.bedKey}` : ""}
            </DialogTitle>
          </DialogHeader>

          {selectedBedDetail?.tasks?.length ? (
            selectedBedDetail.tasks.map(task => (
              <div key={task.id} className="space-y-2 rounded border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {task.status === "completed" && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <p className="font-semibold">{getTaskDisplayName(task)}</p>
                  <Badge variant="outline">{taskLabels[task.task_type]}</Badge>
                  <Badge
                    variant={
                      task.status === "completed"
                        ? "default"
                        : task.status === "cancelled"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {statusLabels[task.status]}
                  </Badge>
                  {task.is_unplanned && (
                    <Badge className="bg-orange-500 text-white hover:bg-orange-500">
                      Imprevisto
                    </Badge>
                  )}
                </div>

                {task.chemical_id && (
                  <p className="text-sm text-blue-700">
                    Quimico: {chemicalMap.get(task.chemical_id) || "No disponible"}
                  </p>
                )}

                {task.notes && (
                  <p className="text-sm italic text-gray-700">{task.notes}</p>
                )}

                <p className="text-sm text-gray-500">
                  Creada: {formatDateTime(task.created_at)}
                  {task.assigned_by && profileMap.get(task.assigned_by) && (
                    <> · por {profileMap.get(task.assigned_by)}</>
                  )}
                </p>

                {task.status === "completed" && task.completed_at && (
                  <p className="text-sm text-green-700">
                    Ejecutada: {formatDateTime(task.completed_at)}
                    {task.completed_by && profileMap.get(task.completed_by) && (
                      <> · por {profileMap.get(task.completed_by)}</>
                    )}
                  </p>
                )}

                {task.status === "cancelled" && (
                  <div className="text-sm text-slate-600">
                    {task.cancelled_at && (
                      <p>
                        Cancelada: {formatDateTime(task.cancelled_at)}
                        {task.cancelled_by && profileMap.get(task.cancelled_by) && (
                          <> · por {profileMap.get(task.cancelled_by)}</>
                        )}
                      </p>
                    )}
                    {task.cancelled_reason && <p>Motivo: {task.cancelled_reason}</p>}
                  </div>
                )}

                {task.status === "pending" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canCompleteTasks && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={completeMutation.isPending}
                        onClick={() =>
                          setCompletionDraft({
                            manualDateTime: getDateTimeInputValue(new Date().toISOString()),
                            task,
                            useCurrentTime: true
                          })
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                        Marcar ejecutada
                      </Button>
                    )}

                    {canCancelTasks && !task.is_unplanned && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={cancelMutation.isPending}
                        onClick={() =>
                          setCancellationDraft({
                            reason: "",
                            task
                          })
                        }
                      >
                        Cancelar tarea
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p>Sin tareas</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(completionDraft)}
        onOpenChange={open => {
          if (!open) setCompletionDraft(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Dar por terminada esta tarea?</DialogTitle>
          </DialogHeader>

          {completionDraft && (
            <div className="space-y-5">
              <div className="rounded border bg-muted/40 p-3">
                <p className="font-medium">{getTaskDisplayName(completionDraft.task)}</p>
                <p className="text-sm text-muted-foreground">
                  {taskLabels[completionDraft.task.task_type]}
                  {completionDraft.task.is_unplanned && " · Imprevisto"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">¿Con qué fecha y hora se registra la ejecucion?</p>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCompletionDraft(prev =>
                        prev ? { ...prev, useCurrentTime: true } : prev
                      )
                    }
                    className={cn(
                      "flex items-center gap-3 rounded border p-3 text-left text-sm transition-colors",
                      completionDraft.useCurrentTime
                        ? "border-primary bg-primary/5 font-medium"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                      completionDraft.useCurrentTime ? "border-primary bg-primary" : "border-muted-foreground"
                    )}>
                      {completionDraft.useCurrentTime && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    Fecha y hora actual
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCompletionDraft(prev =>
                        prev ? { ...prev, useCurrentTime: false } : prev
                      )
                    }
                    className={cn(
                      "flex items-center gap-3 rounded border p-3 text-left text-sm transition-colors",
                      !completionDraft.useCurrentTime
                        ? "border-primary bg-primary/5 font-medium"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                      !completionDraft.useCurrentTime ? "border-primary bg-primary" : "border-muted-foreground"
                    )}>
                      {!completionDraft.useCurrentTime && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    Elegir fecha y hora manualmente
                  </button>
                </div>
              </div>

              {!completionDraft.useCurrentTime && (
                <div className="space-y-2">
                  <Label htmlFor="manual-completed-at">Fecha y hora de ejecucion</Label>
                  <Input
                    id="manual-completed-at"
                    type="datetime-local"
                    value={completionDraft.manualDateTime}
                    onChange={event =>
                      setCompletionDraft(prev =>
                        prev
                          ? { ...prev, manualDateTime: event.target.value }
                          : prev
                      )
                    }
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Solo el supervisor o administrador pueden registrar la ejecucion de tareas.
              </p>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCompletionDraft(null)}>
                  No, volver
                </Button>
                <Button
                  type="button"
                  className="gap-1.5"
                  onClick={handleCompleteSubmit}
                  disabled={completeMutation.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                  {completeMutation.isPending ? "Guardando..." : "Si, marcar ejecutada"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancellationDraft)}
        onOpenChange={open => {
          if (!open) setCancellationDraft(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar tarea</DialogTitle>
          </DialogHeader>

          {cancellationDraft && (
            <div className="space-y-4">
              <p className="text-sm">
                Solo el jefe de area o el administrador pueden cancelar tareas programadas.
              </p>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Motivo</Label>
                <Input
                  id="cancel-reason"
                  value={cancellationDraft.reason}
                  onChange={event =>
                    setCancellationDraft(prev =>
                      prev ? { ...prev, reason: event.target.value } : prev
                    )
                  }
                  placeholder="Motivo de la cancelacion"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCancellationDraft(null)}>
                  Volver
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    cancelMutation.mutate({
                      reason: cancellationDraft.reason,
                      task: cancellationDraft.task
                    })
                  }
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Cancelando..." : "Confirmar cancelacion"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTaskDefinitionId)}
        onOpenChange={open => { if (!open) setDeleteTaskDefinitionId(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar tarea del panel?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              La tarea se quitara del panel lateral. Las tareas ya asignadas a camas no se veran afectadas.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteTaskDefinitionId(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteTaskDefinitionMutation.isPending}
                onClick={() => {
                  if (deleteTaskDefinitionId) {
                    deleteTaskDefinitionMutation.mutate(deleteTaskDefinitionId)
                  }
                }}
              >
                {deleteTaskDefinitionMutation.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-task-name">Nombre</Label>
              <Input
                id="new-task-name"
                placeholder="Ej: pintar hojas"
                value={newTaskName}
                onChange={event => setNewTaskName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo base</Label>
              <Select
                value={newTaskType}
                onValueChange={value => setNewTaskType(value as TaskType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(taskLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 rounded border p-3 text-sm">
              <Checkbox
                checked={newTaskPermanent}
                onCheckedChange={checked => setNewTaskPermanent(Boolean(checked))}
              />
              <span>Dejar esta tarea permanente en la fila lateral</span>
            </label>

            {!newTaskPermanent && (
              <p className="text-xs text-muted-foreground">
                Si no es permanente, solo quedara disponible para la semana seleccionada.
              </p>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={() => createTaskDefinitionMutation.mutate()}
              disabled={createTaskDefinitionMutation.isPending}
            >
              {createTaskDefinitionMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function currentStatusKey(status: TaskStatus): "cancelled" | "completed" | "pending" {
  if (status === "completed") return "completed"
  if (status === "cancelled") return "cancelled"
  return "pending"
}
