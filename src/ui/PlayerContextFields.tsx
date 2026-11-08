import { parsePlayerContext, PLAYER_CONTEXT, PLAYER_CONTEXT_FIELDS } from '../core'
import type { PlayerContext } from '../core'
import { Select } from './fields'

const FIELDS = Object.keys(PLAYER_CONTEXT) as (keyof typeof PLAYER_CONTEXT)[]

/**
 * The three Player Context choices (role, mousepad size, aiming style), each optional ("Not specified"). Shared by onboarding and Options.
 * Only fixed choices can be picked, which is what keeps Player Context from ever being free text the AI Coach could read as an instruction.
 */
export function PlayerContextFields({ value, onChange }: { value: PlayerContext; onChange: (next: PlayerContext) => void }) {
  return (
    <>
      {FIELDS.map((field) => (
        <Select
          key={field}
          label={PLAYER_CONTEXT_FIELDS[field]}
          value={value[field] ?? ''}
          choices={[['', 'Not specified'], ...Object.entries(PLAYER_CONTEXT[field])] as readonly (readonly [string, string])[]}
          onChange={(choice) => onChange(parsePlayerContext({ ...value, [field]: choice }))} // '' is not a choice, so it clears the field
        />
      ))}
    </>
  )
}
