# Components — Overview

Catalog and routing. Read the component file before building; states are specified there
with exact values.

| Component | Purpose | Guidelines file |
|---|---|---|
| Button | trigger an action; one `default` per view | `button.md` |
| Input | single-line text entry | (pattern below) |
| Card | grouped content, one surface step up | (pattern below) |
| Chip / Badge | metadata, status, featured markers | (pattern below) |

## Which variant? — decision tree

```
Is it THE action of the view?          -> <Button variant="default">
Is it a supporting action?             -> <Button variant="secondary">
Is it destructive?                     -> <Button variant="destructive">
Is it a quiet second action?           -> <Button variant="outline"> / "ghost"
```

## Shared patterns (until a dedicated file exists)

Use shadcn's own installed components (`<Input>`, `<Card>`, `<Badge>`) — these Tailwind
classes are what they already read from `../styles.css`; don't redeclare them:

- **Input**: `bg-background` field · `border-border` outline · `text-foreground` value ·
  `placeholder:text-muted-foreground`. Focus/disabled are already correct on the installed
  component — do not override.
- **Card**: `bg-card text-card-foreground` on `bg-background`, `border-border`.
- **Chip/Badge**: fill class + its own `-foreground` class · `rounded-full` · small type size.
