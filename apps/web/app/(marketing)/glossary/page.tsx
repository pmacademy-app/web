import { permanentRedirect } from 'next/navigation'

// The glossary merged into /frameworks. A 308 tells crawlers the move is permanent.
export default function GlossaryPage() {
  permanentRedirect('/frameworks')
}
