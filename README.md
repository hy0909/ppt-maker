# ppt-maker — Presentation Slide Generation Skill

Auto-generate presentation slides from text outlines or existing PPTX files. Produces consistent, well-structured decks in both PDF and PPTX formats, following a rule-based design system.

Transform your outline into a polished presentation: structure follows a proven grammar for slide composition, text density matches your document type (dense for evaluation, airy for audience listening), and visual tokens (colors, typography, spacing) stay consistent throughout.

---

## What You Need

**Node.js & Python:**
```bash
node --version    # Node 18+ required
python --version  # Python 3.8+ required
```

**Install dependencies:**
```bash
# Fonts (Pretendard + Paperlogy, both SIL OFL)
./install_fonts.sh

# Slide rendering and PDF generation
cd skills/ppt-maker/scripts && npm install
npx playwright install chromium

# PPTX generation and verification
cd ../app && npm install

# Python libraries for PPTX and PDF handling
pip install python-pptx pymupdf
```

**Fonts:** `./install_fonts.sh` downloads and installs both (macOS and Linux).
- **Pretendard** (body text) — SIL OFL 1.1, https://github.com/orioncactus/pretendard
- **Paperlogy** (cover and section titles) — SIL OFL 1.1, https://github.com/Freesentation/paperlogy

Both are free for personal and commercial use. Their OFL terms cover the font files
themselves and are independent of this repository's terms.

**Optional:**
- LibreOffice (only for verifying PPTX rendering locally; not required for generation)

**Claude integration:**
- Supply your own Claude login: `claude auth login` (Claude Code CLI), OR
- Set `ANTHROPIC_API_KEY` environment variable with your Anthropic API key
- No API key ships with this repo; costs are on your account only

---

## Quick Start

Run a local dev server:
```bash
./start.sh
```

Open http://localhost:3891 in your browser. You'll see:
1. **Settings**: Choose document type, brand colors, logo
2. **Input**: Paste text outline or upload an existing PPTX
3. **Compose**: AI generates slide structure; you edit and refine
4. **Output**: Download PDF or PPTX

The server stops when you close the terminal. For a persistent background service (macOS only):
```bash
./install_service.sh       # Start service (runs on login, auto-restarts)
./install_service.sh restart   # After code changes
./install_service.sh remove    # Uninstall
```

Log file (if using service): `skills/ppt-maker/app/workspace/server.log`

---

## How It Works

**Source of truth:** `outline.json` — the structured data describing your presentation. Everything else (HTML, PPTX, PDF) is regenerated from this.

**Pipeline:**
1. Build HTML: `outline.json` → `deck.html` (slide templates rendered as HTML)
2. Check layout: Verify no text overflows or gets cut off
3. Export PDF: Chromium headless → `deck.pdf` (1 slide = 1 page)
4. Build PPTX: HTML → native PPTX (editable in PowerPoint)
5. Verify PPTX: Check for out-of-bounds shapes

**Never edit** `deck.html`, `deck.pptx`, or `deck.pdf` directly. They regenerate on every build. Edit the input `outline.json` instead, or use the browser editor to change it visually.

---

## Slide Grammar & Rules

All slides follow a structure that's effective for both reading and listening:

```
Header          "N. Section name – subtitle"
Lead message    1–2 sentences summarizing the slide's conclusion
Body            2–3 columns with cards, diagrams, tables, or images
Optional banner Bottom callout or highlight
```

**Two density modes:**
- **Dense** (default for proposals, reports, evaluations): 12–14pt text, many shapes, information-packed. Readers study the slide in detail.
- **Airy** (for presentations, investor pitches, internal updates): 16pt+, whitespace, one message per slide. Audience listens while glancing at visuals.

See `skills/ppt-maker/references/deck-rules.md` for the complete rule set: how to structure each slide, text length limits, color and typography rules, and layout guidelines.

---

## Document Types

Choose a template for your document purpose:

| Type | Use when | Density | Sections |
| --- | --- | --- | --- |
| **A. Technical Presentation** | Pitching technology or a PoC to evaluators | Dense | Background → Requirements → Solution → Demo → Technical details → Expected impact |
| **B. Project Progress Report** | Reporting R&D or funded project status (annual, stage, or final) | Dense | Overview → Performance → Development content → Commercialization / Next steps |
| **C. Technical Proposal** | Responding to an RFP or grant call | Dense | Problem → Objectives → Approach → Timeline / Budget → Team / Credentials |
| **D. Investor Pitch (IR)** | Raising investment | Airy | Problem → Solution → Market → Competitive advantage → Business model → Traction → Team → Funding request |
| **E. Company Overview (B2B)** | Introducing your company to sales prospects | Airy | Company overview → Technology → Products → Case studies → Customer logos → How to start |
| **F. Customer Proposal** | Proposing a solution tailored to one customer | Dense or Airy | Customer situation → Your solution → Implementation → Expected benefits → Timeline / Cost → Support |
| **G. Internal Status Update** | Reporting progress to leadership | Airy | What we'll do → When → Current status → Risks / blockers |

See `docs/02_outline-templates.md` for the full section-by-section breakdown of each type, with required inputs and variation patterns.

---

## 이용 조건

읽는 것은 자유합니다. 복제·수정·재배포·상업적 이용은 허락이 필요합니다.

자세한 내용은 `COPYRIGHT.md`를 참고하세요. 질문이 있으면 이 저장소의 Issues를 통해 문의해 주세요.

---

## Design Conventions

The slide engine and visual design were informed by real-world presentation patterns used internally at SafeAI. The rule set—including slide structure, text density modes, typography hierarchy, and spatial composition—has been distilled into reusable guidelines so any user can produce consistent, professional output.

**Fonts:** Pretendard and Paperlogy are both licensed under the SIL Open Font License 1.1.
The font files are not bundled here; `./install_fonts.sh` fetches them from the official sources.

**Logo:** The bundled logo sample (`logo_*.png`) is SafeAI trademark. When you use this code, you must replace it with your own logo.

---

## 개인정보와 계정

### AI는 쓰는 사람 계정으로 돕니다

AI가 필요하면 Claude Code CLI에 로그인하거나 API 키를 환경변수로 넘겨야 합니다. 원본 코드에는 API 키가 없습니다. 로그인 정보는 모두 당신의 홈 폴더에 저장되고, 웹 화면과 스크립트는 당신의 환경에서만 당신 계정으로 AI를 씁니다.

### 만든 파일은 이 컴퓨터에만 있습니다

웹 화면과 스크립트가 만드는 PPT, PDF, JSON 파일은 모두 workspace 폴더에만 저장됩니다. 이 폴더는 git에 올라가지 않고, 어디로도 전송되지 않습니다. 쓴 토큰 개수 같은 기록도 이 컴퓨터 파일에만 남습니다.

**주의:** 웹 서버를 `HOST=0.0.0.0`으로 실행하면 같은 네트워크의 모든 사용자가 접근할 수 있습니다. 로그인이 없으므로 신뢰할 수 있는 환경에서만 사용하세요.

---

## Next Steps

- Start with `./start.sh` to see the interface
- Read `docs/01_reference-analysis.md` for the grammar behind slide structure
- Check `docs/02_outline-templates.md` for your document type
- Consult `skills/ppt-maker/references/deck-rules.md` for style rules, length limits, and layout decisions
- See `skills/ppt-maker/SKILL.md` for detailed feature documentation

Questions or issues? Check the issues tracker or submit a pull request.

