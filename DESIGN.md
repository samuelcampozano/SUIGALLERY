# Design

## Source of truth

Status: Needs refresh. Updated 2 October 2026. Surface: authenticated web vault, sharing modal, landing page and app shell. Evidence reviewed: `public/index.html`, `public/app.js`, `public/style.css`, tenant catalog/envelope routes, `pending_milestones.md`, the product briefing, and branch `Nodus---Design-System-(-app-and-website-)` (`79a6e14`). The design branch adds `DESIGN_SYSTEM.md`, `Nodus Website.html` and `Nodus app.html` as high-fidelity references only; it does not change the shipping frontend, backend or API. The pre-existing share modal offers a direct decrypted link; it is legacy UI and is replaced by the member-only sharing flow below.

## Brand

Nodus is calm, technically credible and protective: “Your data. Under your control.” The new reference defines Deep Black, restrained Nodus Blue, Geist/Geist Mono, technical grid and Guardian imagery. Trust signals are explicit recipient identity, access level, expiration, encryption state, a clearly labelled Devnet/Testnet environment and explorer proof. Avoid crypto hype, “anyone with the link” language, irreversible-looking destructive controls, or claims that a server can read data keys.

## Product goals

Let an authorized member grant another organization member time-bound access to one asset or the current assets in a folder, without the gateway receiving plaintext data keys. The public surface must communicate private cloud value before protocol mechanics, then make SIWS, Devnet PDAs and Walrus/Sui verification inspectable for the technical audience. Success means a recipient can see a clear access state and an owner can revoke a grant. Non-goals for this slice: public links, passwords, outside recipients and automatic access to assets added to a folder later.

## Personas and jobs

Owners/admins manage collaborator access. Contributors share a file they own with teammates. Viewers consume shared assets. All operate primarily on desktop but may approve/revoke on mobile.

## Information architecture

Landing page → onboarding/sign-in → vault gallery → lightbox/share. The landing leads with privacy, control and programmability; chain names appear as verifiable infrastructure rather than a wallet prerequisite. Asset lightbox/card exposes “Share”. Folder browsing exposes “Share folder”. One modal contains: item summary, member selector, role selector (`viewer`, `contributor`, `admin`), optional expiration, existing grants and revoke controls. The server remains the source of truth; client-side envelope creation happens only after the recipient’s public identity is loaded.

## Design principles

- State the scope: one file or the current contents of one folder.
- Make expiration opt-in and legible in local time.
- Default to least privilege (`viewer`).
- Show encryption as an implementation guarantee, not a task users must understand.
- Never display a raw key or a decrypted universal link.

## Visual language

The shipping app needs a deliberate token migration from its current style to the reference: Deep `#080B0A`, Nodus Blue `#1FA8FF` as a sparing signal, Stone/Slate neutrals, Geist/Geist Mono, 4px spacing scale, restrained 16px cards and Lucide 1.5px icons. New sharing rows use the active surface/border tokens; no second parallel design system.

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

Vanilla HTML/CSS/JS frontend, Express API, PostgreSQL tenant store and ECDH-P256/AES-GCM envelopes. Each grant is organization-scoped and the server stores only metadata plus already-encrypted envelopes. Tests must cover tenant isolation, expiration and insufficient role. The design-reference branch is a standalone in-browser prototype with mock data and bundled resources, so it must be ported component-by-component rather than served or merged as production code. Existing i18n has English/Portuguese/Spanish variants; the product briefing requires Portuguese-first for the demo.

## Open questions

- [ ] Product owner: should a folder grant automatically apply to files added after the grant? Owner: Product. Impact: requires envelope propagation on every future upload/move.
- [ ] Product owner: should a contributor be able to grant `admin`, or only owner/admin? Owner: Product. Impact: permission matrix. This slice uses owner/admin for `admin`; contributors may grant `viewer` and `contributor` only for assets they own.
- [ ] Product/engineering: choose the smallest production slice of the design reference (landing, sign-in, gallery, share) and map it to real routes/data before visual porting. Owner: Product + frontend. Impact: prevents a visually polished mock from displacing the working demo.
