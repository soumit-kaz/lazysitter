---
name: forms-validation
description: Build forms that are accessible, resilient and honest about errors — labelling, validation timing, error association and announcement, submission states, and not losing the user's work. Load for any form.
---

# Forms and validation

Forms are where accessibility, state management and error handling all meet, and where losing the user's work is most costly.

## Labelling

- **Every control has a real `<label>`** with `htmlFor` matching the input's `id`, or wrapping it. A placeholder is **not** a label — it disappears exactly when the user needs it, and it fails contrast requirements in most designs.
- **Group related controls** with `<fieldset>` + `<legend>` — radio groups especially, where the group's question is otherwise never announced.
- **Mark required fields in text**, not by an asterisk alone (`aria-required` plus a visible convention explained once).
- **Hint text** is associated with `aria-describedby`, so it is announced with the field rather than orphaned near it.

## Validation timing — the part that most often annoys users

- **Do not validate on every keystroke while first typing.** Telling someone their email is invalid at `j@` is noise.
- **Validate on blur** for the field just left, **and on submit** for everything.
- **Once a field has an error, re-validate on change** so the error clears as soon as it is fixed. Making the user submit again to learn they fixed it is the worst of both.
- **Async validation** (username availability) needs debouncing, a pending state, and a guard against out-of-order responses — the same request-ordering problem as any fetch.

## Error association and announcement

Three things must be true for every error:
1. **`aria-invalid="true"`** on the field;
2. **`aria-describedby`** pointing at the error message element;
3. **the message is text**, not colour or an icon alone.

On a failed submit:
- **move focus to the first invalid field** (or to an error summary that links to each);
- **announce the failure** — a `role="alert"` summary saying how many errors and where. Without it, a screen-reader user presses Submit and hears nothing.

An **error summary at the top** listing each error as a link to its field is the most usable pattern for long forms, and it is what most public-sector accessibility guidance converges on.

## Message content

Say what is wrong **and what to do**. "Invalid input" fails both. "Password must be at least 12 characters" passes both. For server errors, say whether retrying will help.

Never blame the user for a format you could have accepted — strip spaces from card numbers, accept several phone formats, trim whitespace. Rejecting `4111 1111 1111 1111` because of spaces is a choice, and a bad one.

## Submission states

- **Disable the submit button while submitting**, or guard against double-submit another way — a double-click creating two records is the classic.
- **Show progress** for anything beyond ~1s.
- **On success**: say so, and be explicit about where the user is now. Navigating silently makes people wonder whether it worked.
- **On failure**: **keep every value the user entered.** Losing a long form to a network error is the defect people actually remember, and it is entirely avoidable.

## Do not lose the user's work

- Preserve values across a failed submission (above).
- Warn before navigating away from a dirty form — via a route guard, and `beforeunload` for a real page unload.
- For long forms, consider draft persistence — and if you persist, follow the persistence rules in `state-topology` (key, version, stale-read path, nothing credential-shaped).

## Autofill and input semantics

Correct `type` and `autoComplete` attributes make browsers and password managers work, and they are an accessibility and usability win, not a nicety:
`type="email"`, `type="tel"`, `inputMode="numeric"`, `autoComplete="email"`, `"current-password"`, `"new-password"`, `"one-time-code"`, `"street-address"`.

Fighting autofill (blocking paste in a password field, disabling autocomplete on an address) makes the form harder for everyone and more likely to be filled wrongly.

## Client validation is UX, server validation is the control

Client-side validation is a fast feedback loop. It is **not** a security boundary — anything the client checks, the server must check too. If that is unknown for a new field, it is a `BACKEND-DEPENDENCY` to surface, not an assumption.

## Testing

```jsx
await user.click(screen.getByRole('button', { name: 'Save' }));
expect(screen.getByRole('alert')).toHaveTextContent('2 problems');
expect(screen.getByLabelText('Email')).toHaveFocus();
expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
```
`getByLabelText` finding the field is itself a labelling assertion — it fails if the label is not properly associated.

## Checklist

```
## Form — <name>
## Labelling (field — label mechanism — hint via describedby)
## Grouping (fieldset/legend where needed)
## Validation timing (blur / submit / re-validate on change once errored / async debounce+ordering)
## Error association (aria-invalid + describedby + text) per field
## Submit failure (focus target, alert announcement, error summary?)
## Message quality (what is wrong + what to do)
## Submission states (double-submit guard, progress, success destination)
## Work preservation (values kept on failure? dirty-navigation warning? draft persistence?)
## autoComplete / inputMode / type per field
## Server-side validation confirmed (or BACKEND-DEPENDENCY raised)
## Tests (which of the above are asserted)
```
