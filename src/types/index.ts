import type {
  User,
  Location,
  Shift,
  ShiftAssignment,
  SwapRequest,
  StaffSkill,
  StaffLocation,
  ManagerLocation,
  Availability,
  Notification,
  AuditLog,
  Role,
  Skill,
  ShiftStatus,
  AssignmentStatus,
  SwapStatus,
  SwapType,
  NotificationType,
  AuditAction,
  AvailabilityType,
} from '@prisma/client'

// Re-export Prisma enums so the rest of the app imports from one place.
export type {
  Role,
  Skill,
  ShiftStatus,
  AssignmentStatus,
  SwapStatus,
  SwapType,
  NotificationType,
  AuditAction,
  AvailabilityType,
}

// =============================================================================
// Constraint engine — returned by every scheduling rule check
// =============================================================================

/** A single alternative staff suggestion returned when a hard constraint fails. */
export interface StaffSuggestion {
  id: string
  name: string
  email: string
}

/**
 * Unified result type for all scheduling constraint checks.
 *
 * - `allowed: true`  + no warning  → proceed silently
 * - `allowed: true`  + warning     → soft block: show warning, manager may proceed
 * - `allowed: false` + reason      → hard block: action must be refused
 * - `suggestions`                  → alternative staff when a hard block fires
 */
export interface ConstraintResult {
  allowed: boolean
  /** Soft warning — does not block the action, but must be surfaced to the manager. */
  warning?: string
  /** Hard failure message — the action must be blocked. */
  reason?: string
  /** Alternative staff to suggest when allowed=false. */
  suggestions?: StaffSuggestion[]
}

// =============================================================================
// Composite / "with-relations" types
// =============================================================================

/** User profile returned to client components (passwordHash stripped server-side). */
export type SafeUser = Omit<User, 'passwordHash'>

/** Staff member including their skills and location certifications. */
export type UserWithSkillsAndLocations = User & {
  skills: StaffSkill[]
  staffLocations: (StaffLocation & { location: Location })[]
}

/** Manager including the locations they are responsible for. */
export type ManagerWithLocations = User & {
  managerLocations: (ManagerLocation & { location: Location })[]
}

/** Shift including its assignments and the assigned users. */
export type ShiftWithAssignments = Shift & {
  assignments: (ShiftAssignment & {
    user: SafeUser
  })[]
  location: Location
}

/** Shift assignment including the shift and the assigned user. */
export type AssignmentWithShiftAndUser = ShiftAssignment & {
  shift: ShiftWithAssignments
  user: SafeUser
}

/** Swap request with full context needed to render the request card. */
export type SwapRequestWithContext = SwapRequest & {
  assignment: ShiftAssignment & {
    shift: Shift & { location: Location }
    user: SafeUser
  }
  requester: SafeUser
  target: SafeUser | null
}

/** Notification with any deeply-linked entity pre-fetched. */
export type NotificationWithMetadata = Notification & {
  /** Parsed metadata — may contain shiftId, swapId, locationId, etc. */
  parsedMetadata: Record<string, string>
}

/** Audit log entry with the actor's name for display. */
export type AuditLogWithActor = AuditLog & {
  actor: Pick<User, 'id' | 'name' | 'email' | 'role'>
}

// =============================================================================
// Schedule / calendar view types
// =============================================================================

/** One day's worth of shifts at a single location, used by the calendar grid. */
export interface DaySchedule {
  date: Date
  /** ISO date string "YYYY-MM-DD" in the location's local timezone. */
  dateKey: string
  locationId: string
  shifts: ShiftWithAssignments[]
}

/** Grouped schedule keyed by dateKey, used by the weekly grid view. */
export type WeeklySchedule = Record<string, DaySchedule>

// =============================================================================
// Availability helper types
// =============================================================================

/** Recurring availability window for a given day of week. */
export interface RecurringWindow {
  dayOfWeek: number // 0–6
  startTime: string // "HH:mm" in user's local timezone
  endTime: string // "HH:mm" in user's local timezone
  isAvailable: boolean
}

/** Exception availability for a specific calendar date. */
export interface AvailabilityException {
  date: Date
  startTime?: string // "HH:mm" in user's local timezone
  endTime?: string
  isAvailable: boolean
}

// =============================================================================
// Overtime / cost projection types
// =============================================================================

/** Per-employee weekly hours & cost projection used in the manager dashboard. */
export interface OvertimeProjection {
  userId: string
  userName: string
  scheduledHours: number
  desiredWeeklyHours: number | null
  overtimeHours: number
  regularCost: number
  overtimeCost: number
  totalCost: number
  /** True when scheduledHours ≥ 40 (US standard overtime threshold). */
  isOverOvertimeThreshold: boolean
}

// =============================================================================
// API response envelope
// =============================================================================

/** Standard success envelope for all API route responses. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

/** Standard error envelope for all API route responses. */
export interface ApiError {
  success: false
  error: string
  /** Field-level validation errors keyed by field name. */
  fieldErrors?: Record<string, string[]>
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// =============================================================================
// Notification preference map
// =============================================================================

/** Shape of the `notificationPrefs` JSON column on User. */

export type NotificationPrefs = Partial<
  Record<NotificationType, { inApp: boolean; email: boolean }>
>

// =============================================================================
// Pagination
// =============================================================================

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// =============================================================================
// Export report types
// =============================================================================

/** Row shape written to CSV / JSON audit exports. */
export interface AuditExportRow {
  id: string
  actorName: string
  actorEmail: string
  action: AuditAction
  entityType: string
  entityId: string
  locationId: string
  overrideReason: string | null
  createdAt: string // ISO 8601
}

/** Row shape written to CSV / JSON schedule exports. */
export interface ScheduleExportRow {
  shiftId: string
  locationName: string
  skill: Skill
  startTimeUtc: string
  endTimeUtc: string
  startTimeLocal: string
  endTimeLocal: string
  status: ShiftStatus
  isPremium: boolean
  assignedStaff: string // comma-separated names
}
