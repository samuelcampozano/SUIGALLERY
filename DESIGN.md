# Design

## Source of truth

Status: Active. Updated 2 October 2026. Surface: authenticated web vault, sharing modal and asset/folder actions. Evidence reviewed: `public/index.html`, `public/app.js`, `public/style.css`, tenant catalog/envelope routes, `pending_milestones.md`. The pre-existing share modal offers a direct decrypted link; it is legacy UI and is replaced by the member-only sharing flow below.

## Brand

Nodus is calm, technically credible and protective. Trust signals are explicit recipient identity, access level, expiration and encryption status. Avoid “anyone with the link” language, irreversible-looking destructive controls, or claims that a server can read data keys.

## Product goals

Let an authorized member grant another organization member time-bound access to one asset or the current assets in a folder, without the gateway receiving plaintext data keys. Success means a recipient can see a clear access state and an owner can revoke a grant. Non-goals for this slice: public links, passwords, outside recipients and automatic access to assets added to a folder later.

## Personas and jobs

Owners/admins manage collaborator access. Contributors share a file they own with teammates. Viewers consume shared assets. All operate primarily on desktop but may approve/revoke on mobile.

## Information architecture

Asset lightbox/card exposes “Share”. Folder browsing exposes “Share folder”. One modal contains: item summary, member selector, role selector (`viewer`, `contributor`, `admin`), optional expiration, existing grants and revoke controls. The server remains the source of truth; client-side envelope creation happens only after the recipient’s public identity is loaded.

## Design principles

- State the scope: one file or the current contents of one folder.
- Make expiration opt-in and legible in local time.
- Default to least privilege (`viewer`).
- Show encryption as an implementation guarantee, not a task users must understand.
- Never display a raw key or a decrypted universal link.

## Visual language

Reuse existing CSS variables, Plus Jakarta Sans, Lucide icons, rounded elevated modal, status colors and motion. New sharing rows use the existing surface/border tokens; no parallel design system.

## Components

Reuse `.modal-dialog`, `.modal-content`, `.form-input`, `.btn`, toast notifications and Lucide icons. Add a share access row with recipient, role badge, expiry and revoke button; states are loading, empty, expired and revoked.

## Accessibility

Target WCAG 2.1 AA. The modal has a labelled title, visible focus, keyboard-close, semantic labels for role/expiration inputs, buttons with text labels, and status messages announced through the existing toast region.

## Responsive behavior

At narrow widths, member rows wrap metadata below the name and footer actions stack; no hover-only action is required.

## Interaction states

Loading shows disabled submit action; empty says no team member has access; expired access is visually distinct and cannot be revived without creating a new grant; API errors preserve the entered form values; revoke requires confirmation.

## Content voice

Use plain, reassuring language: “Grant encrypted access”, “Expires”, “Remove access”. Do not say “share the key”; say “encrypt access for this member”.

## Implementation constraints

Vanilla HTML/CSS/JS frontend, Express API, PostgreSQL tenant store and ECDH-P256/AES-GCM envelopes. Each grant is organization-scoped and the server stores only metadata plus already-encrypted envelopes. Tests must cover tenant isolation, expiration and insufficient role. Existing i18n has English/Portuguese/Spanish variants; new strings start in English with neutral fallback and must be extractable later.

## Open questions

- [ ] Product owner: should a folder grant automatically apply to files added after the grant? Owner: Product. Impact: requires envelope propagation on every future upload/move.
- [ ] Product owner: should a contributor be able to grant `admin`, or only owner/admin? Owner: Product. Impact: permission matrix. This slice uses owner/admin for `admin`; contributors may grant `viewer` and `contributor` only for assets they own.
