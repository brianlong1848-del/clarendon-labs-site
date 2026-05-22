import { redirect } from 'next/navigation'

// /about is superseded by /studio in the redesigned site.
export default function About() {
  redirect('/studio')
}
