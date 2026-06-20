# 🎨 FinMate UI/UX Brief (UI_UX_BRIEF.md)

## 📌 References & Design Source
The style guidelines, color systems, layouts, and components specified in this document are directly referenced from:
1. The design mockup image: [UI_UX_MOCKUP.jpg](file:///d:/prvn/Projects/FinMate/UI_UX_MOCKUP.jpg)
2. The core system style requirements described in [FinMate_Project_Specification.md](file:///d:/prvn/Projects/FinMate/FinMate_Project_Specification.md)

## 💎 Design Language & Personality
- **Design Language**: Sleek, modern, and premium dark/light mode experience utilizing glassmorphism overlays, Harmonious HSL-derived colors, and subtle micro-animations for high-fidelity interactive feedback.
- **Brand Personality**: Professional, Trustworthy, Financial, Intelligent, and Clean.

---

## 🎨 Color System

| Palette Role | Theme | Light Mode HEX | Dark Mode HEX | Tailored Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | Dark Slate / Indigo | `#4F46E5` | `#6366F1` | Brand actions, active states |
| **Secondary** | Cool Grey / Slate | `#475569` | `#94A3B8` | Subtitles, inactive borders |
| **Accent** | Violet / Purple | `#7C3AED` | `#A78BFA` | Special analytics indicators, highlights |
| **Success** | Emerald Green | `#10B981` | `#34D399` | Net positive balances, settlements confirmed |
| **Warning** | Amber / Orange | `#F59E0B` | `#FBBF24` | Carry-forward closures, pending actions |
| **Error** | Rose Red | `#EF4444` | `#FB7185` | Net negative balances, voided transaction labels |
| **Neutral Background** | Dark / Light Slate | `#F8FAFC` | `#0F172A` | Global background canvas |
| **Neutral Card** | Glass Border Slate | `#FFFFFF` | `#1E293B` | Ledger cards, lists, detail panes |

---

## 🔤 Typography
- **Primary Font Family**: `Inter`, `Outfit` (Fallback: `sans-serif`) imported from Google Fonts.
- **Heading Scales**:
  - `h1`: 2.25rem (36px) — Bold (700)
  - `h2`: 1.5rem (24px) — Semibold (600)
  - `h3`: 1.25rem (20px) — Medium (500)
- **Body Scales**:
  - `body-large`: 1rem (16px) — Regular (400)
  - `body-normal`: 0.875rem (14px) — Regular (400)
  - `caption`: 0.75rem (12px) — Light (300)

---

## 🧱 Component System

### 🔘 Buttons
- **Style**: Pill or Rounded-LG (8px border-radius). Solid colors for primary actions, subtle glass borders for secondary actions.
- **Hover State**: Lift effect (`translate-y-[-1px]`) and brightness enhancement.
- **Active State**: Compression scaling (`scale-95`).

### 🎴 Cards
- **Style**: Border-radius: `12px` (`rounded-xl`). Background uses `backdrop-filter: blur(8px)` with a transparent border (`border border-white/10` in dark mode).
- **Shadow**: Subtle elevation shadow.

### 📝 Forms & Inputs
- **Style**: Border-radius: `6px`. Clear focus ring borders (`focus:ring-2 focus:ring-primary/50`).
- **Error State**: Rose-colored border with error message caption displayed below.

### 📊 Charts & Visualizations
- **Expected vs Actual**: Household targets render expected contributions as a baseline progress bar. Actual contributions fill the progress bar, color-coded in green (for surplus) or red/orange (for deficit).

---

## 🖥️ Screen Designs

### 1. Dashboard Layout
- **Structure**: Three-column grid (Desktop) or single column list (Mobile).
- **Empty States**: If no expenses, render a placeholder illustration with a "Create your first expense" call-to-action button.
- **Loading States**: Shimmer skeleton blocks mimicking cards and metrics.

### 2. Group Detail Ledger
- **Structure**: Sticky filter header, virtual scrolling list items for ledger logs.
- **Micro-Animations**: Hovering over a ledger row highlights the split details icon. Expanding a row slides down split participants.
- **Error State**: Banner displaying "Unable to load ledger. Retry?" with retryable programmatic cooldown.

---

## 🚫 Design Rules
1. **Never introduce ad-hoc color codes**. All styles must reference the HSL/HEX design token palette.
2. **Typography consistency**: Do not bypass heading hierarchies (e.g., placing an `h3` directly inside the body header without an `h1` or `h2` structure).
3. **Glassmorphism limits**: Keep blur values at `backdrop-blur-md` (8px) to prevent layout performance drops on low-end mobile devices.
