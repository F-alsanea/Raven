import type { RavenLanguage, RavenPermissions, RavenTaskContract } from './types.ts'

const ARABIC_RE = /[\u0600-\u06FF]/
const ENGLISH_RE = /[A-Za-z]/

const ACTIONS = ['commit', 'push', 'deploy', 'migrate'] as const

type ControlledAction = typeof ACTIONS[number]

const ACTION_PATTERNS: Record<ControlledAction, RegExp[]> = {
  commit: [/\bcommit\b/i, /(?:كوميت|كومِت|اعمل\s+كوميت|سو(?:ي)?\s+كوميت)/i],
  push: [/\bpush\b/i, /(?:بوش|ارفع\s+(?:ل|الى|إلى)?\s*github|ادفع\s+(?:ل|الى|إلى)?\s*github)/i],
  deploy: [/\bdeploy(?:ment)?\b/i, /(?:ديبلوي|نشر|انشر)/i],
  migrate: [/\bmigrat(?:e|ion)\b/i, /(?:مايجريت|مهاجر(?:ة)?|ترحيل\s+(?:قاعدة|البيانات))/i],
}

const NEGATION_PREFIX = /(?:\bdo\s+not\b|\bdon['’]?t\b|\bnever\b|\bwithout\b|\bno\b|(?:^|\s)لا(?:\s|$)|ممنوع|بدون)/i

/** Detect Arabic, English, or mixed natural-language commands. */
export function detectLanguage(text: string): RavenLanguage {
  const hasArabic = ARABIC_RE.test(text)
  const hasEnglish = ENGLISH_RE.test(text)
  if (hasArabic && hasEnglish) return 'mixed'
  return hasArabic ? 'ar' : 'en'
}

function normalize(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim()
}

function clauses(text: string): string[] {
  return normalize(text)
    .split(/(?:\n+|[.;؛]|،|,(?=\s)|\bthen\b|\bbut\b|\bif\b|\bunless\b|\bبعدها\b|\bلكن\b|\bإذا\b|\bاذا\b)/i)
    .map(value => value.trim())
    .filter(Boolean)
}

function mentionsAction(text: string, action: ControlledAction): boolean {
  return ACTION_PATTERNS[action].some(pattern => pattern.test(text))
}

function isNegatedAction(text: string, action: ControlledAction): boolean {
  if (!mentionsAction(text, action)) return false
  const compact = normalize(text)
  const actionIndex = ACTION_PATTERNS[action]
    .map(pattern => compact.search(pattern))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]
  if (actionIndex === undefined) return false
  const prefix = compact.slice(Math.max(0, actionIndex - 45), actionIndex)
  return NEGATION_PREFIX.test(prefix)
}

function defaultPermissions(): RavenPermissions {
  return {
    read: true,
    edit: true,
    test: true,
    commit: false,
    push: false,
    deploy: false,
    migrate: false,
  }
}

function inferGoal(parts: string[]): string {
  const directivePattern = /(?:do\s+not|don['’]?t|never|لا|ممنوع|بدون|read\b|اقر|راجع|اختبر|test\b|commit\b|push\b|deploy\b|migrat)/i
  return parts.find(part => !directivePattern.test(part)) ?? parts[0] ?? ''
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function asksToReadProjectInstructions(part: string): boolean {
  const namesProjectInstructions = /(?:AGENTS\.md|CLAUDE\.md|HANDOFF\.md|instructions?|تعليمات)/i.test(part)
  const containsReadVerb = /(?:\bread\b|اقر|راجع|افتح)/i.test(part)
  return namesProjectInstructions && containsReadVerb
}

/**
 * Compile a bilingual user command into Raven's immutable task contract.
 * The first implementation intentionally extracts explicit constraints only;
 * ambiguous intent remains in `goal` for the planner instead of being invented.
 */
export function compileCommand(sourceText: string): RavenTaskContract {
  const text = normalize(sourceText)
  if (!text) throw new Error('Raven command must not be empty')

  const parts = clauses(text)
  const permissions = defaultPermissions()
  const forbidden: string[] = []
  const requirements: string[] = []
  const completion: string[] = []
  const conditional: RavenTaskContract['conditional'] = []

  for (const part of parts) {
    for (const action of ACTIONS) {
      if (!mentionsAction(part, action)) continue
      if (isNegatedAction(part, action)) {
        permissions[action] = false
        forbidden.push(action)
      } else {
        permissions[action] = true
      }
    }

    if (asksToReadProjectInstructions(part)) {
      requirements.push('read project instructions')
    }
    if (/(?:verify|check|تأكد|تاكد|تحقق).*(?:branch|فرع)/i.test(part)) {
      requirements.push('verify repository branch')
    }
    if (/(?:reproduce|إعادة\s*إنتاج|اعد\s*انتاج|كرر\s+المشكلة)/i.test(part)) {
      requirements.push('reproduce issue')
    }
    if (/(?:test|اختبر|اختبارات)/i.test(part)) {
      requirements.push('run relevant tests')
      completion.push('tests passed')
    }
    if (/(?:typecheck|type-check|فحص\s+الأنواع|فحص\s+الانواع)/i.test(part)) {
      requirements.push('run typecheck')
      completion.push('typecheck passed')
    }
    if (/(?:build|بناء|بلد)/i.test(part)) {
      requirements.push('run build')
      completion.push('build passed')
    }

    const conditionMatch = part.match(/(?:if|إذا|اذا)\s+(.+?)(?:,|،|\s+then\s+|\s+ف(?:ـ)?\s*|\s+وقف|\s+stop)(.+)/i)
    if (conditionMatch) {
      conditional.push({ condition: conditionMatch[1]!.trim(), action: conditionMatch[2]!.trim() })
    }
  }

  if (/\bmain\b/i.test(text) && /(?:لا|never|do\s+not|don['’]?t|ممنوع).{0,35}\bmain\b/i.test(text)) {
    forbidden.push('checkout main')
  }

  if (permissions.commit) completion.push('requested commit created')

  return {
    sourceText: text,
    language: detectLanguage(text),
    goal: inferGoal(parts),
    requirements: unique(requirements),
    forbidden: unique(forbidden),
    conditional,
    permissions,
    completion: unique(completion),
  }
}
