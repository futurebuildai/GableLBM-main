# GableLBM Design System

**Theme**: Industrial Dark
**Philosophy**: High Contrast, Data Density, Zero Clutter. A tool for professionals.

## 1. Color Palette

### Core Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Gable Green** | `#00FFA3` | Primary Actions, Success States, Active Glow |
| **Deep Space** | `#0A0B10` | Global Background |
| **Slate Steel** | `#161821` | Card Backgrounds, Sidebar, Modals |
| **Safety Red** | `#F43F5E` | Errors, Stockouts, Credit Hold |
| **Blueprint Blue** | `#38BDF8` | Technical Data, Dimensions, Links |

### Utilities
- **Glass**: `rgba(255, 255, 255, 0.05)` with `backdrop-filter: blur(12px)`
- **Border**: `rgba(255, 255, 255, 0.1)`

## 2. Typography

### UI Font: Inter
Used for labels, headers, and body text.
- **Weights**: 400 (Regular), 500 (Medium), 600 (Semi-Bold)

### Data Font: JetBrains Mono
Used for **all** numerical data and identifiers.
- **Usage**: SKUs, Prices, Quantities, Dimensions
- **Why**: Monospaced fonts align vertically in grids, making rapid scanning of financial/inventory data easier

## 3. Core Components (Shadcn/UI Base)

### Buttons
- **Primary**: Solid Gable Green, Black Text. Hover: Glow Shadow
- **Secondary**: Outline White/10. Hover: White/20
- **Destructive**: Outline Safety Red

### Data Grids
- **Header**: Sticky, Slate Steel background
- **Rows**: Hover highlight (zebra striping optional)
- **Density**: Condensed padding (`py-2`)

### Inputs
- **Style**: Dark background, White/20 border
- **Focus**: Gable Green border glow

## 4. Micro-Animations
- **Hover**: Lift `translateY(-2px)` with shadow
- **Transitions**: All state changes `duration-200`
- **Loading**: Skeleton loaders (pulsing blocks), never spinners for layouts
