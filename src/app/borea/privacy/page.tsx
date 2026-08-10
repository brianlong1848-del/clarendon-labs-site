import type { Metadata } from 'next'
import { LEGAL_STYLE, shell } from '../LegalShell'

export const metadata: Metadata = {
  title: 'Borea — Privacy Policy',
  description:
    'What Borea collects, what stays on your iPhone, what is sent when you use the AI coach, and what is never done with your health data.',
  metadataBase: new URL('https://boreaapp.com'),
  alternates: { canonical: 'https://boreaapp.com/privacy' },
}

const LEDE =
  'Borea has no account and no sign-in. Your food log, weigh-ins and progress photos live on your iPhone. This page says exactly what leaves it, when, and why.'

const BODY = `
<div class="bl-callout">
  <strong>The short version.</strong> There is no account. Your log and photos stay on your device.
  When you use an AI feature, only what is needed to answer that one request is sent, and it is not
  kept as a profile or used to train a model. Your health data is never used for advertising,
  never sold, and never shared with data brokers.
</div>

<h2>1. Who we are</h2>
<p>Borea is made by <strong>Clarendon Labs LLC</strong>, an independent iOS studio in Chicago, Illinois. In this policy &ldquo;we&rdquo; and &ldquo;us&rdquo; mean Clarendon Labs LLC, and &ldquo;the app&rdquo; means Borea for iPhone.</p>

<h2>2. What stays on your device</h2>
<p>Borea is on-device first. The following never leaves your iPhone unless you deliberately share it:</p>
<ul>
  <li><strong>Your food log</strong> &mdash; meals, portions, macros, water and sodium.</li>
  <li><strong>Your plans and goals</strong> &mdash; targets, dates and the day-by-day schedule.</li>
  <li><strong>Your progress photos</strong> &mdash; including the body-aligned versions used by the transformation player. These are stored in the app on your device and are never uploaded to us.</li>
  <li><strong>Your settings</strong> &mdash; dietary preferences, allergies, date of birth, height and activity level.</li>
</ul>
<p><strong>Apple Health.</strong> Weight, body-composition scans, steps and workouts are read from and written to Apple Health with your permission, and remain under Apple&rsquo;s control and yours. You can revoke that permission at any time in the Health app. We do not copy your Health data to our servers, and we do not store personal health information in iCloud.</p>

<h2>3. What is sent, and only when you ask</h2>
<p>Borea&rsquo;s AI features need a server. Each of the following happens only when you actively use that feature:</p>
<ul>
  <li><strong>Meal descriptions, photos and voice notes.</strong> When you describe, dictate or photograph a meal, that content is sent to our AI provider to estimate calories and macros, and the estimate is returned to your phone.</li>
  <li><strong>Coach questions.</strong> When you ask the coach something, your question is sent along with a short window of recent context from your log &mdash; recent meals, totals, weigh-ins and your current plan &mdash; so the answer reflects your real numbers rather than generic advice.</li>
  <li><strong>Spoken replies.</strong> If you play a reply aloud, the text of that reply is sent to a speech provider to generate the audio. No other data is included.</li>
</ul>
<p>These requests are processed to produce a response and are not retained by us as a history or a profile. We do not build a server-side copy of your log.</p>

<h2>4. What we never do</h2>
<ul>
  <li>We never use your health or fitness data for advertising or marketing, ours or anyone else&rsquo;s.</li>
  <li>We never sell, rent or broker your data.</li>
  <li>We never share your health data with data brokers, or with third parties for their own purposes.</li>
  <li>We never use your data to train AI models.</li>
  <li>We carry no ads, no third-party analytics SDKs, no attribution kits and no social pixels.</li>
  <li>We do not track you across apps or websites, which is why Borea never shows the App Tracking Transparency prompt.</li>
</ul>

<h2>5. Third-party processors</h2>
<p>Each processor below is contractually limited to acting on our behalf and is prohibited from using your data for its own purposes.</p>
<h3>Anthropic</h3>
<p>Generates Borea&rsquo;s calorie estimates and coaching replies. Receives the meal content or question you submit plus the limited context described above. Processed and returned; not used to train models.</p>
<h3>ElevenLabs</h3>
<p>Turns a coach reply into audio when you choose to hear it. Receives the reply text only.</p>
<h3>Supabase</h3>
<p>Hosts the server function that routes AI requests. Requests pass through; your log is not stored there.</p>
<h3>Apple</h3>
<p>Handles app distribution, subscriptions and crash reporting under Apple&rsquo;s own privacy policy. We receive aggregated, anonymised sales reports and crash reports that contain no personal content.</p>

<h2>6. Retention and deletion</h2>
<p>Because your log lives on your device, <strong>deleting Borea deletes it</strong>. Data you wrote to Apple Health remains in Apple Health, where you can delete it separately.</p>
<p>If you turn on cloud backup, that backup is stored in your own iCloud account, not ours, and is removed when you delete it or turn the feature off.</p>
<p>AI requests are transient and are not kept as a profile. If you want confirmation about a specific request, email us and we will tell you what we can see &mdash; which, by design, is very little.</p>

<h2>7. Children</h2>
<p>Borea is not directed at children under 13 and we do not knowingly collect personal information from them. Borea is intended for adults managing their own nutrition.</p>

<h2>8. Your rights</h2>
<p>California residents have rights under the CCPA, and residents of the EU and UK have rights under the GDPR, including the right to access, correct, port and delete personal data. Because Borea keeps your data on your device, most of these you can exercise directly by using or deleting the app. For anything else, email us and we will respond within the time the applicable law requires.</p>

<h2>9. Changes</h2>
<p>We will update this page when our practices change, and the date at the top will change with it. We will not reduce your existing privacy protections without telling you in the app first.</p>

<h2>10. Contact</h2>
<p>Privacy questions are answered by the engineer who wrote the code.</p>
<p><strong>Email:</strong> <a href="mailto:hello@clarendon.dev">hello@clarendon.dev</a><br/>
<strong>Mail:</strong> Clarendon Labs LLC &middot; 4801 N. Clarendon Ave. &middot; Chicago, IL 60640 &middot; United States</p>
`

export default function BoreaPrivacy() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LEGAL_STYLE }} />
      <div dangerouslySetInnerHTML={{ __html: shell('Privacy Policy', 'Version 1.0 · 10 August 2026', LEDE, BODY) }} />
    </>
  )
}
