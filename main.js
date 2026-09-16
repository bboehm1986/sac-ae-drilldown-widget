/*
    AE Employer Drill-Down — SAC Custom Widget

    Built 2026-09-14, per Blair: a raw native SAC Table sitting next to
    the Executive/Operational widgets' glassmorphism styling looked
    bolted-on. This is a third custom widget instead, sharing the exact
    same design system, so the per-employer 2026-vs-2027 comparison
    reads as part of the dashboard rather than a plain grid dropped next
    to it. See BUILD_PLAN_VWEMPLOYERSAVES.md in the sac-ae-snap-report-
    widget folder, "Per-employer 2026-vs-2027 drill-down", for the
    original spec — and "Merge GLD_AE_Employer_Enrollment_YoY into Gold"
    for why this now reads from GLD_AE_Employer_Enrollment directly.

    Unlike the other two widgets, this one binds to its OWN model
    (AM_EMPLOYER_ENROLLMENT_DETAIL, row-level — one row per employer, not
    an aggregate cube) and is meant to sit beside a native SAC Input
    Control that filters it by Employer_Name via standard Linked
    Analysis. That's a different mechanism than the internal click/change
    events that are confirmed NOT to reach a custom widget in Optimized
    Story View mode (see the original widget's README) — an EXTERNAL
    Input Control changing the bound query's filter and pushing fresh
    data through onCustomWidgetAfterUpdate is the standard, already-
    working pattern used elsewhere on this Story (Synod/Status Input
    Controls already do this today against the other two widgets' shared
    model).

    Re-pointed 2026-09-16 at the merged Gold layer, per Blair: the
    standalone GLD_AE_Employer_Enrollment_YoY view (and the
    AM_EMPLOYER_ENROLLMENT_YOY model on it) were deleted once their
    columns were folded directly into GLD_AE_Employer_Enrollment /
    AM_EMPLOYER_ENROLLMENT_DETAIL — see BUILD_PLAN_VWEMPLOYERSAVES.md,
    "Merge GLD_AE_Employer_Enrollment_YoY into Gold". Current-cycle
    columns dropped their "_2027" suffix in the merge (they're Gold's
    plain columns now, same as every other widget reads); only the
    2026-side columns stay suffixed.

    Data binding (declared in widget.json):

      - employerYoy  <- GLD_AE_Employer_Enrollment / AM_EMPLOYER_ENROLLMENT_DETAIL
            dimensions_0 = Employer_Name
            dimensions_1 = Synod_Region
            dimensions_2 = Eligible_Band       ("20+" / "10-19" / "3-9" /
                            "Under 3" / "Unknown")
            dimensions_3 = Enrollment_Status   (Success / Abandoned / Not
                            Started / In Progress / Needs Follow-up)
            dimensions_4 = Status_2026         (Matt Christensen's own
                            vocabulary — Undetermined / Completed EL /
                            Completed OTP / etc. — NOT reconciled against
                            Enrollment_Status; still unresolved how to
                            source this same vocabulary for 2027, see
                            BUILD_PLAN_VWEMPLOYERSAVES.md)
            dimensions_5 = Contribution_Set
            dimensions_6 = Contribution_Set_2026
            dimensions_7 = Health_Plan_Bundle  (no 2026 equivalent —
                            always shown as "—" on that side)
            measures_0   = Employee_Count
            measures_1   = Employee_Count_2026
            measures_2   = Eligible_Count_2027
            measures_3   = HSA_Single
            measures_4   = HSA_Family
            measures_5   = HSA_One_Time_Single
            measures_6   = HSA_One_Time_Family
            measures_7   = HSA_Single_2026
            measures_8   = HSA_Family_2026
            measures_9   = HSA_One_Time_Single_2026
            measures_10  = HSA_One_Time_Family_2026

      Employer_Display_Name exists on Gold too but stays out of this
      binding for now — scoped to "Gold only" per Blair's 2026-09-16
      decision, not yet wired into this widget or its Input Control.

    Two render states, decided purely by how many rows arrive:
      - No Input Control selection  -> many rows -> "needs attention"
        list, sorted client-side (largest Eligible_Band, least-complete
        Status_2027 first) — the "constructive default state" Blair
        asked for. Capped to a readable number of rows; a caption points
        at the Input Control for the full comparison.
      - One employer selected       -> exactly one row -> a clean
        2026-vs-2027 side-by-side comparison card.

    Until wired to the real Datasphere-backed model, the widget renders
    from the MOCK_* constants below (see preview.html) — one mock set
    for the multi-row default state, one for the single-row selected
    state, toggled via the "Toggle mock: selected employer" preview
    control since real Input Control filtering can't be simulated
    standalone.
*/
(function () {
    "use strict";

    // Largest-first — mirrors the Operational widget's BAND_ORDER exactly,
    // so "needs attention" prioritizes the same way across both dashboards.
    const BAND_ORDER = ["20+", "10-19", "3-9", "Under 3", "Unknown"];
    const STATUS_PRIORITY = {
        "Not Started": 1, "In Progress": 2, "Needs Follow-up": 3, "Abandoned": 4, "Success": 5,
    };
    const MAX_LIST_ROWS = 20;

    function row(dims, measures) {
        const out = {};
        dims.forEach((d, i) => { out["dimensions_" + i] = { id: d, label: d }; });
        measures.forEach((m, i) => { out["measures_" + i] = { raw: m, formatted: String(m) }; });
        return out;
    }

    // Multi-row mock — the unfiltered "needs attention" default state.
    const MOCK_YOY_LIST = { data: [
        row(["Trinity Lutheran Church", "Southwestern Minnesota", "20+", "Not Started", "Undetermined", "", "", ""], [0, 34, 41, 0, 0, 0, 0, 900, 900, 500, 0]),
        row(["First Lutheran Church", "Metropolitan Chicago", "20+", "In Progress", "Completed EL", "TRAD_VLHD", "TRAD_VLCP", ""], [0, 28, 33, 0, 0, 0, 0, 1200, 1200, 0, 0]),
        row(["Grace Lutheran Church", "Southeastern Synod", "10-19", "Not Started", "Undetermined", "", "", ""], [0, 15, 17, 0, 0, 0, 0, 0, 0, 0, 0]),
        row(["Zion Lutheran Church", "Southwestern Minnesota", "10-19", "Abandoned", "Completed OTP", "TRAD_SLCP", "TRAD_SLCP", "Value Copay"], [26, 14, 16, 900, 900, 0, 0, 900, 900, 0, 0]),
        row(["St. John's Lutheran Church", "Metropolitan Chicago", "3-9", "Success", "Completed EL", "TRAD_SLHD", "TRAD_SLHD", "Value HDHP"], [7, 6, 8, 0, 0, 500, 0, 0, 0, 500, 0]),
        row(["Bethlehem Lutheran Church", "Southeastern Synod", "Under 3", "Success", "Completed OTP", "TRAD_VLCP", "TRAD_VLCP", "Select Copay"], [2, 2, 2, 1200, 1200, 0, 0, 1200, 1200, 0, 0]),
    ] };

    // Single-row mock — one employer selected via the Input Control.
    const MOCK_YOY_SELECTED = { data: [
        row(["Trinity Lutheran Church", "Southwestern Minnesota", "20+", "In Progress", "Undetermined", "TRAD_VLHD", "", "Value HDHP"], [36, 34, 41, 1200, 1200, 500, 0, 900, 900, 500, 0]),
    ] };

    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                box-sizing: border-box;
                font-family: "72", "Segoe UI", Arial, sans-serif;

                /* Same glassmorphism/depth design system as the other two
                   widgets, copied wholesale for visual consistency. */
                --mesh-1: rgba(106, 92, 240, 0.16);
                --mesh-2: rgba(47, 111, 224, 0.12);
                --mesh-3: rgba(20, 151, 111, 0.10);
                --surface: rgba(255, 255, 255, 0.58);
                --surface-solid: #ffffff;
                --surface-2: rgba(23, 26, 35, 0.055);
                --border: rgba(255, 255, 255, 0.65);
                --text: #171a23;
                --text-soft: #5b6072;
                --accent: #6a5cf0;
                --accent-bg: rgba(106, 92, 240, 0.14);
                --success: #14976f;
                --success-bg: rgba(20, 151, 111, 0.14);
                --warning: #a5700c;
                --warning-bg: rgba(165, 112, 12, 0.14);
                --info: #2f6fe0;
                --info-bg: rgba(47, 111, 224, 0.14);
                --danger: #c94b4b;
                --danger-bg: rgba(201, 75, 75, 0.14);
                --glass-blur: blur(20px) saturate(180%);
                --shadow-card: 0 1px 1px rgba(23,26,35,0.03), 0 4px 12px -2px rgba(23,26,35,0.07), 0 14px 28px -10px rgba(23,26,35,0.10);
            }
            * { box-sizing: border-box; }

            .dashboard {
                width: 100%;
                height: 100%;
                overflow: auto;
                background:
                    radial-gradient(at 12% 8%, var(--mesh-1) 0%, transparent 45%),
                    radial-gradient(at 88% 14%, var(--mesh-2) 0%, transparent 45%),
                    radial-gradient(at 50% 100%, var(--mesh-3) 0%, transparent 50%),
                    #f4f5fa;
                color: var(--text);
                border-radius: 18px;
                padding: 18px;
            }

            .panel, .badge, .pill {
                backdrop-filter: var(--glass-blur);
                -webkit-backdrop-filter: var(--glass-blur);
            }
            @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
                .panel { background: rgba(255,255,255,0.94) !important; }
            }

            .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
            .eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 4px; }
            .topbar h1 { font-size: 19px; font-weight: 700; margin: 0; display: inline; }
            .titlewrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .badge { font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; padding: 3px 9px; border-radius: 100px; border: 1px solid; white-space: nowrap; }
            .badge.accent { color: var(--accent); border-color: rgba(106,92,240,0.35); background: var(--accent-bg); }

            .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-card); }
            .panel-caption { font-size: 12px; color: var(--text-soft); margin: 0 0 10px; }
            .empty-row { font-size: 12.5px; color: var(--text-soft); padding: 4px 0; }

            /* ---- Selected-employer comparison card ---- */
            .employer-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
            .employer-head h2 { font-size: 17px; font-weight: 700; margin: 0; color: var(--text); }
            .pill { font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 100px; border: 1px solid rgba(106,92,240,0.35); background: var(--accent-bg); color: var(--accent); white-space: nowrap; }
            .employer-sub { font-size: 12px; color: var(--text-soft); margin-bottom: 14px; }

            .compare-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
            .compare-table th, .compare-table td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--border); }
            .compare-table thead th { color: var(--text-soft); font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; }
            .compare-table thead th:not(:first-child) { text-align: right; }
            .compare-table tbody td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
            .compare-table tbody th { font-weight: 600; color: var(--text); white-space: nowrap; }
            .compare-table tbody tr:last-child td, .compare-table tbody tr:last-child th { border-bottom: none; }

            /* ---- Needs-attention default list ---- */
            .attn-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 8px 0; border-bottom: 1px solid var(--border); }
            .attn-row:last-child { border-bottom: none; }
            .attn-row .name { flex: 1 1 auto; min-width: 0; }
            .attn-row .name .primary { color: var(--text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .attn-row .name .secondary { color: var(--text-soft); font-size: 11px; }
            .attn-row .status { flex: none; font-size: 11.5px; color: var(--text-soft); white-space: nowrap; }
            .attn-more { font-size: 11px; color: var(--text-soft); text-align: center; padding-top: 10px; }
        </style>
        <div class="dashboard">
            <div class="topbar">
                <div>
                    <div class="eyebrow">2026 vs 2027 Comparison</div>
                    <div class="titlewrap">
                        <h1>Employer Drill-Down</h1>
                        <span class="badge accent" id="dataBadge">Mock Data — Preview</span>
                    </div>
                </div>
            </div>
            <div class="panel" id="body"></div>
        </div>
    `;

    class AEEmployerDrilldown extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));

            this._props = { width: 900, height: 420 };
            this._employerYoy = MOCK_YOY_LIST;
            this._usingMockData = true;
        }

        connectedCallback() {
            this._render();
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = Object.assign({}, this._props, changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            if ("width" in changedProperties) this.style.width = changedProperties.width + "px";
            if ("height" in changedProperties) this.style.height = changedProperties.height + "px";
            if ("employerYoy" in changedProperties) { this._employerYoy = changedProperties.employerYoy; this._usingMockData = false; }
            this._render();
        }

        onCustomWidgetDestroy() {
            // No timers/subscriptions held; nothing to tear down.
        }

        refresh() {
            this._render();
        }

        // ---- Parsing helpers — same normalization pattern as the other
        // two widgets (SAC represents a blank dimension member as literal
        // placeholder text, not an empty string). ----
        _dim(r, i) {
            const d = r["dimensions_" + i];
            if (!d) return "";
            if (d.id === "@NullMember" || d.label === "(Null)" || d.label === "(No Value)") return "";
            return d.label;
        }
        _measure(r, i) {
            const m = r["measures_" + i];
            return m ? Number(m.raw) : 0;
        }

        _parseRow(r) {
            return {
                employerName: this._dim(r, 0),
                synodRegion: this._dim(r, 1),
                eligibleBand: this._dim(r, 2),
                enrollmentStatus: this._dim(r, 3),
                status2026: this._dim(r, 4),
                contributionSet: this._dim(r, 5),
                contributionSet2026: this._dim(r, 6),
                healthPlanBundle: this._dim(r, 7),
                employeeCount: this._measure(r, 0),
                employeeCount2026: this._measure(r, 1),
                eligibleCount2027: this._measure(r, 2),
                hsaSingle: this._measure(r, 3),
                hsaFamily: this._measure(r, 4),
                hsaOneTimeSingle: this._measure(r, 5),
                hsaOneTimeFamily: this._measure(r, 6),
                hsaSingle2026: this._measure(r, 7),
                hsaFamily2026: this._measure(r, 8),
                hsaOneTimeSingle2026: this._measure(r, 9),
                hsaOneTimeFamily2026: this._measure(r, 10),
            };
        }

        _bandPriority(band) {
            const i = BAND_ORDER.indexOf(band);
            return i === -1 ? BAND_ORDER.length : i;
        }
        _statusPriority(status) {
            return STATUS_PRIORITY[status] || 99;
        }

        _money(v) {
            return "$" + Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // ---- Selected-employer comparison card ----
        _comparisonCardHtml(e) {
            const rows = [
                { label: "Status", v2026: e.status2026 || "—", v2027: e.enrollmentStatus || "—" },
                { label: "Contribution Set", v2026: e.contributionSet2026 || "—", v2027: e.contributionSet || "—" },
                { label: "Health Plan Bundle", v2026: "—", v2027: e.healthPlanBundle || "—" },
                { label: "HSA Single", v2026: this._money(e.hsaSingle2026), v2027: this._money(e.hsaSingle) },
                { label: "HSA Family", v2026: this._money(e.hsaFamily2026), v2027: this._money(e.hsaFamily) },
                { label: "HSA One-Time Single", v2026: this._money(e.hsaOneTimeSingle2026), v2027: this._money(e.hsaOneTimeSingle) },
                { label: "HSA One-Time Family", v2026: this._money(e.hsaOneTimeFamily2026), v2027: this._money(e.hsaOneTimeFamily) },
                { label: "Employee Count", v2026: e.employeeCount2026.toLocaleString(), v2027: e.employeeCount.toLocaleString() },
            ];
            const bodyRows = rows.map((r) =>
                `<tr><th scope="row">${r.label}</th><td>${r.v2026}</td><td>${r.v2027}</td></tr>`
            ).join("");
            return `
                <div class="employer-head">
                    <h2>${e.employerName || "(Unnamed Employer)"}</h2>
                    <span class="pill">${e.eligibleBand || "Unknown"} eligible</span>
                </div>
                <div class="employer-sub">${e.synodRegion || "No region on file"}</div>
                <table class="compare-table">
                    <thead><tr><th scope="col"></th><th scope="col">2026</th><th scope="col">2027</th></tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>`;
        }

        // ---- Needs-attention default list (no employer selected) ----
        _attentionListHtml(entries) {
            if (!entries.length) return `<div class="empty-row">No employer data bound yet</div>`;
            const shown = entries.slice(0, MAX_LIST_ROWS);
            const rowsHtml = shown.map((e) =>
                `<div class="attn-row">
                    <div class="name">
                        <div class="primary" title="${e.employerName}">${e.employerName || "(Unnamed Employer)"}</div>
                        <div class="secondary">${e.eligibleBand || "Unknown"} eligible &middot; ${e.synodRegion || "No region"}</div>
                    </div>
                    <div class="status">${e.enrollmentStatus || "—"}</div>
                </div>`
            ).join("");
            const more = entries.length > MAX_LIST_ROWS
                ? `<div class="attn-more">+ ${(entries.length - MAX_LIST_ROWS).toLocaleString()} more — select an employer above to see their full comparison</div>`
                : "";
            return rowsHtml + more;
        }

        // ---- Rendering ----
        _render() {
            const root = this._shadowRoot;
            const dataBadgeEl = root.getElementById("dataBadge");
            dataBadgeEl.hidden = !this._usingMockData;

            const rawRows = (this._employerYoy && this._employerYoy.data) || [];
            const rows = rawRows.map((r) => this._parseRow(r));
            const bodyEl = root.getElementById("body");

            if (rows.length === 1) {
                bodyEl.innerHTML = this._comparisonCardHtml(rows[0]);
                return;
            }

            // Needs-attention default state — sorted client-side, largest
            // Eligible_Band and least-complete Enrollment_Status first. No
            // SQL sort-helper columns needed here since a custom widget
            // sorts in JS anyway (unlike the native-Table alternative this
            // replaced, see BUILD_PLAN_VWEMPLOYERSAVES.md).
            const sorted = rows.slice().sort((a, b) => {
                const bandDiff = this._bandPriority(a.eligibleBand) - this._bandPriority(b.eligibleBand);
                if (bandDiff !== 0) return bandDiff;
                const statusDiff = this._statusPriority(a.enrollmentStatus) - this._statusPriority(b.enrollmentStatus);
                if (statusDiff !== 0) return statusDiff;
                return (a.employerName || "").localeCompare(b.employerName || "");
            });

            bodyEl.innerHTML = `
                <div class="panel-caption">Needs attention, by size (largest, least-complete first) — select an employer above for a full 2026 vs 2027 comparison</div>
                ${this._attentionListHtml(sorted)}`;
        }
    }

    // Exposed statically so preview.html can toggle between the two mock
    // states without duplicating the datasets — real Input Control
    // filtering can't be simulated standalone.
    AEEmployerDrilldown.MOCK_YOY_LIST = MOCK_YOY_LIST;
    AEEmployerDrilldown.MOCK_YOY_SELECTED = MOCK_YOY_SELECTED;

    customElements.define("com-porticobenefits-aedrilldown", AEEmployerDrilldown);
})();
