(function () {
  const STORAGE_KEY = "appointment-calendar-widget:v1";
  const THEME_KEY = "appointment-calendar-theme:v1";
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const TIME_OPTIONS = buildTimeOptions("08:00", "23:00", 30);

  const state = loadState();
  const dom = {};

  let selectedDate = null;
  let modalDate = null;
  let pendingTime = null;
  let copiedSlots = [];
  let exportFormat = "grouped";
  let exportDurationHours = 4;
  let exportDateFormat = "yyyy-mm-dd";
  let exportDivider = getDefaultDivider("grouped");
  let exportTab = "text";
  let theme = loadTheme();
  let dragSourceDate = "";
  let dragTargetDate = "";
  let toastTimer = 0;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    applyTheme();
    bindDom();
    selectedDate = findInitialSelectedDate();
    wireEvents();
    renderAll();
  }

  function bindDom() {
    dom.calendar = document.getElementById("calendar");
    dom.monthLabel = document.getElementById("monthLabel");
    dom.editorMessage = document.getElementById("editorMessage");
    dom.themeToggle = document.getElementById("themeToggle");

    dom.slotModal = document.getElementById("slotModal");
    dom.modalBackdrop = document.getElementById("modalBackdrop");
    dom.modalDateLabel = document.getElementById("modalDateLabel");
    dom.modalMessage = document.getElementById("modalMessage");
    dom.timeGrid = document.getElementById("timeGrid");

    dom.exportModal = document.getElementById("exportModal");
    dom.exportBackdrop = document.getElementById("exportBackdrop");
    dom.exportMessage = document.getElementById("exportMessage");
    dom.exportTextArea = document.getElementById("exportTextArea");
    dom.textExportPanel = document.getElementById("textExportPanel");
    dom.icsExportPanel = document.getElementById("icsExportPanel");
    dom.showTextExport = document.getElementById("showTextExport");
    dom.showIcsExport = document.getElementById("showIcsExport");
    dom.downloadIcs = document.getElementById("downloadIcs");
    dom.copyExportText = document.getElementById("copyExportText");
    dom.icsDurationSelect = document.getElementById("icsDurationSelect");
    dom.exportFormatSelect = document.getElementById("exportFormatSelect");
    dom.dateFormatSelect = document.getElementById("dateFormatSelect");
    dom.dividerInput = document.getElementById("dividerInput");
    dom.toast = document.getElementById("toast");
  }

  function wireEvents() {
    document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
    document.getElementById("nextMonth").addEventListener("click", () => changeMonth(1));
    document.getElementById("resetAll").addEventListener("click", resetAll);
    document.getElementById("openExportModal").addEventListener("click", openExportModal);
    dom.themeToggle.addEventListener("click", toggleTheme);

    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("modalCopyDay").addEventListener("click", copyDaySlots);
    document.getElementById("modalPasteDay").addEventListener("click", pasteDaySlots);
    document.getElementById("modalClearDay").addEventListener("click", clearModalDay);
    dom.modalBackdrop.addEventListener("click", closeModal);

    document.getElementById("closeExportModal").addEventListener("click", closeExportModal);
    dom.showTextExport.addEventListener("click", () => setExportTab("text"));
    dom.showIcsExport.addEventListener("click", () => setExportTab("ics"));
    dom.downloadIcs.addEventListener("click", exportIcs);
    dom.copyExportText.addEventListener("click", copyExportText);
    dom.exportBackdrop.addEventListener("click", closeExportModal);
    dom.icsDurationSelect.addEventListener("change", () => {
      exportDurationHours = Number(dom.icsDurationSelect.value) || 4;
    });
    dom.exportFormatSelect.addEventListener("change", () => {
      exportFormat = dom.exportFormatSelect.value || "grouped";
      exportDivider = getDefaultDivider(exportFormat);
      dom.dividerInput.value = exportDivider;
      updateTextExport();
    });
    dom.dateFormatSelect.addEventListener("change", () => {
      exportDateFormat = dom.dateFormatSelect.value || "yyyy-mm-dd";
      updateTextExport();
    });
    dom.dividerInput.addEventListener("input", () => {
      exportDivider = dom.dividerInput.value || " | ";
      updateTextExport();
    });
  }

  function loadState() {
    const now = new Date();
    const fallback = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei",
      month: toMonthKey(now),
      schedules: {},
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        schedules: sanitizeSchedules(parsed.schedules || {}),
      };
    } catch (error) {
      console.warn("Failed to load state", error);
      return fallback;
    }
  }

  function loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch (error) {
      console.warn("Failed to load theme", error);
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme();
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn("Failed to persist theme", error);
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme);
    if (dom.themeToggle) {
      dom.themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
    }
  }

  function sanitizeSchedules(input) {
    const schedules = {};
    Object.entries(input).forEach(([date, schedule]) => {
      if (!schedule || typeof schedule !== "object") return;
      schedules[date] = {
        date,
        enabled: Boolean(schedule.enabled),
        note: typeof schedule.note === "string" ? schedule.note : "",
        slots: Array.isArray(schedule.slots)
          ? schedule.slots.map((slot, index) => sanitizeSlot(slot, date, index)).filter(Boolean)
          : [],
      };
    });
    return schedules;
  }

  function sanitizeSlot(slot, date, index) {
    if (!slot || typeof slot !== "object") return null;
    if (!isValidTime(slot.start)) return null;
    return {
      id: typeof slot.id === "string" ? slot.id : `${date}-${index}-${Date.now()}`,
      start: slot.start,
      end: isValidTime(slot.end) ? slot.end : addMinutesToTime(slot.start, 30),
      label: typeof slot.label === "string" ? slot.label : "",
      status: normalizeStatus(slot.status),
    };
  }

  function normalizeStatus(status) {
    return ["available", "booked", "break", "closed"].includes(status) ? status : "available";
  }

  function changeMonth(delta) {
    const [year, month] = state.month.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    state.month = toMonthKey(next);
    selectedDate = firstDateOfMonth(state.month);
    persist();
    renderAll();
  }

  function renderAll() {
    renderCalendar();
    if (!dom.slotModal.classList.contains("hidden") && modalDate) renderModal();
    if (!dom.exportModal.classList.contains("hidden")) renderExportTab();
  }

  function renderCalendar() {
    dom.calendar.innerHTML = "";
    const [year, month] = state.month.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    dom.monthLabel.textContent = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
    }).format(first);

    WEEKDAYS.forEach((day) => {
      const label = document.createElement("div");
      label.className = "weekday";
      label.textContent = day;
      dom.calendar.appendChild(label);
    });

    for (let i = 0; i < startWeekday; i += 1) {
      const empty = document.createElement("div");
      empty.className = "day-cell is-empty";
      empty.setAttribute("aria-hidden", "true");
      dom.calendar.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      const key = toDateKey(date);
      const schedule = getSchedule(key);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-cell";
      button.dataset.date = key;
      button.setAttribute("aria-label", `${key} ${schedule.slots.length} slots`);
      if (selectedDate === key) button.classList.add("is-active");
      if (schedule.enabled && schedule.slots.length > 0) button.classList.add("has-slots");
      if (schedule.enabled && schedule.slots.length > 0) button.draggable = true;
      button.innerHTML =
        `<span class="day-number">${day}</span>` +
        `<div class="day-slots">${schedule.slots
          .slice(0, 3)
          .map((slot) => `${slot.start}`)
          .join("<br>")}</div>`;
      button.addEventListener("click", () => openModal(key));
      button.addEventListener("dragstart", (event) => handleCalendarDragStart(event, key));
      button.addEventListener("dragenter", () => handleCalendarDragEnter(key));
      button.addEventListener("dragover", (event) => handleCalendarDragOver(event, key));
      button.addEventListener("drop", (event) => handleCalendarDrop(event, key));
      button.addEventListener("dragend", clearCalendarDrag);
      dom.calendar.appendChild(button);
    }

    updateCalendarDragState();
  }

  function handleCalendarDragStart(event, dateKey) {
    const schedule = getSchedule(dateKey);
    if (!schedule.enabled || !schedule.slots.length) {
      event.preventDefault();
      return;
    }
    dragSourceDate = dateKey;
    dragTargetDate = dateKey;
    copiedSlots = cloneSlotsForPaste(schedule.slots);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", dateKey);
    }
    showToast(`Dragging from ${dateKey}`);
    updateCalendarDragState();
  }

  function handleCalendarDragEnter(dateKey) {
    if (!dragSourceDate || isSameDate(dragSourceDate, dateKey)) return;
    dragTargetDate = dateKey;
    updateCalendarDragState();
  }

  function handleCalendarDragOver(event, dateKey) {
    if (!dragSourceDate) return;
    event.preventDefault();
    if (!isSameDate(dragTargetDate, dateKey)) {
      dragTargetDate = dateKey;
      updateCalendarDragState();
    }
  }

  function handleCalendarDrop(event, dateKey) {
    if (!dragSourceDate || !copiedSlots.length) return;
    event.preventDefault();
    applyPasteTarget(dragSourceDate, dateKey);
    clearCalendarDrag();
  }

  function clearCalendarDrag() {
    if (!dragSourceDate && !dragTargetDate) return;
    dragSourceDate = "";
    dragTargetDate = "";
    updateCalendarDragState();
  }

  function applyPasteTarget(sourceDate, targetDate) {
    if (isSameDate(sourceDate, targetDate)) {
      showToast("Drop on another day");
      return;
    }
    state.schedules[targetDate] = {
      date: targetDate,
      enabled: true,
      note: "",
      slots: cloneSlotsForPaste(copiedSlots, targetDate),
    };
    persist();
    showToast(`Pasted to ${targetDate}`);
    renderAll();
  }

  function cloneSlotsForPaste(slots, dateKey = "") {
    return slots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      label: slot.label,
      status: slot.status,
      id: createSlotId(dateKey || `copy-${Date.now()}`),
    }));
  }

  function isDateInDragRange(dateKey) {
    return false;
  }

  function updateCalendarDragState() {
    if (!dom.calendar) return;
    dom.calendar.querySelectorAll(".day-cell[data-date]").forEach((button) => {
      const dateKey = button.dataset.date || "";
      button.classList.toggle("is-drag-source", dateKey === dragSourceDate);
      button.classList.toggle("is-drag-target", Boolean(dragTargetDate) && dateKey === dragTargetDate && !isSameDate(dragSourceDate, dragTargetDate));
      button.classList.toggle("is-drag-range", isDateInDragRange(dateKey));
    });
  }

  function isSameDate(left, right) {
    return left === right;
  }

  function openModal(dateKey) {
    selectedDate = dateKey;
    modalDate = dateKey;
    clearPendingTime(false);
    dom.slotModal.classList.remove("hidden");
    dom.slotModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setMessage("");
    setModalMessage("");
    renderModal();
  }

  function closeModal() {
    modalDate = null;
    clearPendingTime(false);
    dom.slotModal.classList.add("hidden");
    dom.slotModal.setAttribute("aria-hidden", "true");
    if (dom.exportModal.classList.contains("hidden")) document.body.classList.remove("modal-open");
    setModalMessage("");
  }

  function renderModal() {
    const schedule = getSchedule(modalDate);
    dom.modalDateLabel.textContent = `${modalDate} · tap again to remove`;
    dom.timeGrid.innerHTML = "";

    TIME_OPTIONS.forEach((time) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-chip";
      button.textContent = time;
      if (hasSlotAtTime(schedule.slots, time)) button.classList.add("is-saved");
      if (pendingTime === time) button.classList.add("is-pending");
      button.addEventListener("click", () => toggleSlotAtTime(time));
      dom.timeGrid.appendChild(button);
    });
  }

  function toggleSlotAtTime(time) {
    if (!modalDate) return;
    const schedule = getSchedule(modalDate);
    const existing = schedule.slots.find((slot) => slot.start === time);
    if (existing) {
      deleteSlot(existing.id);
      return;
    }
    addSlotFromTime(time);
  }

  function clearPendingTime(shouldRender = true) {
    pendingTime = null;
    setModalMessage("");
    if (shouldRender && modalDate) renderModal();
  }

  function addSlotFromTime(time) {
    if (!modalDate) return;
    const end = addMinutesToTime(time, 30);
    if (!end) return setModalMessage("This is the final time marker and cannot be used as a start time.");

    pendingTime = time;
    const slot = {
      id: createSlotId(modalDate),
      start: time,
      end,
      label: "",
      status: "available",
    };

    const schedule = getSchedule(modalDate);
    const validation = validateSlot(slot, schedule.slots);
    if (!validation.valid) return setModalMessage(validation.message);

    state.schedules[modalDate] = {
      ...schedule,
      enabled: true,
      slots: schedule.slots.concat(slot).sort(compareSlots),
    };

    clearPendingTime(false);
    persist();
    renderAll();
  }

  function copyDaySlots() {
    if (!modalDate) return;
    const schedule = getSchedule(modalDate);
    copiedSlots = cloneSlotsForPaste(schedule.slots);
    showToast(copiedSlots.length ? "Day copied" : "No slots to copy");
  }

  function pasteDaySlots() {
    if (!modalDate) return;
    if (!copiedSlots.length) return showToast("Nothing copied yet");
    const nextSlots = cloneSlotsForPaste(copiedSlots, modalDate).sort(compareSlots);
    state.schedules[modalDate] = { date: modalDate, enabled: true, note: "", slots: nextSlots };
    persist();
    showToast("Slots pasted");
    renderAll();
  }

  function clearModalDay() {
    if (!modalDate) return;
    state.schedules[modalDate] = { date: modalDate, enabled: false, note: "", slots: [] };
    clearPendingTime(false);
    persist();
    showToast("Day cleared");
    renderAll();
  }

  function deleteSlot(slotId) {
    const dateKey = modalDate || selectedDate;
    const schedule = getSchedule(dateKey);
    const slots = schedule.slots.filter((entry) => entry.id !== slotId);
    state.schedules[dateKey] = { ...schedule, enabled: slots.length > 0, slots };
    persist();
    renderAll();
  }

  function validateSlot(slot, existingSlots) {
    if (!isValidTime(slot.start) || !isValidTime(slot.end)) {
      return { valid: false, message: "Enter valid start and end times." };
    }
    if (slot.end <= slot.start) {
      return { valid: false, message: "End time must be later than start time." };
    }
    const conflict = existingSlots.find((current) => slot.start < current.end && slot.end > current.start);
    if (conflict) {
      return { valid: false, message: `This slot overlaps with ${conflict.start}-${conflict.end}.` };
    }
    return { valid: true };
  }

  function openExportModal() {
    if (!selectedSchedules().length) return setMessage("There are no slots to export.");
    dom.exportModal.classList.remove("hidden");
    dom.exportModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    renderExportTab();
  }

  function closeExportModal() {
    dom.exportModal.classList.add("hidden");
    dom.exportModal.setAttribute("aria-hidden", "true");
    if (dom.slotModal.classList.contains("hidden")) document.body.classList.remove("modal-open");
    setExportMessage("");
  }

  function setExportTab(tab) {
    exportTab = tab === "ics" ? "ics" : "text";
    renderExportTab();
  }

  function renderExportTab() {
    dom.icsDurationSelect.value = String(exportDurationHours);
    dom.exportFormatSelect.value = exportFormat;
    dom.dateFormatSelect.value = exportDateFormat;
    dom.dividerInput.value = exportDivider;
    dom.textExportPanel.classList.toggle("hidden", exportTab !== "text");
    dom.icsExportPanel.classList.toggle("hidden", exportTab !== "ics");
    dom.showTextExport.classList.toggle("is-active", exportTab === "text");
    dom.showIcsExport.classList.toggle("is-active", exportTab === "ics");
    if (exportTab === "text") updateTextExport();
    setExportMessage("");
  }

  function updateTextExport() {
    dom.exportTextArea.value = renderTextPreview(state, exportFormat);
  }

  async function copyExportText() {
    try {
      await navigator.clipboard.writeText(dom.exportTextArea.value);
      showToast("Text copied");
    } catch (error) {
      dom.exportTextArea.focus();
      dom.exportTextArea.select();
      showToast("Copy failed");
    }
  }

  function resetAll() {
    if (!window.confirm("Reset all saved schedules? This cannot be undone.")) return;
    state.month = toMonthKey(new Date());
    state.schedules = {};
    selectedDate = firstDateOfMonth(state.month);
    copiedSlots = [];
    persist();
    closeModal();
    closeExportModal();
    renderAll();
  }

  function renderTextPreview(appState, format) {
    const items = selectedSchedules();
    if (!items.length) return `Month: ${appState.month}\n\nNo schedule yet.`;
    const listPrefix = getListPrefix();

    if (format === "compact") {
      return items
        .map(([date, schedule]) => `${formatDateLabel(date)} ${schedule.slots.map((slot) => `${slot.start}`).join(exportDivider)}`)
        .join("\n");
    }

    if (format === "social") {
      const lines = [];
      lines.push(`${appState.month} Availability`);
      lines.push("");
      items.forEach(([date, schedule]) => {
        lines.push(`${formatDateLabel(date)}`);
        lines.push(`${schedule.slots.map((slot) => `${slot.start}`).join(exportDivider)}`);
        lines.push("");
      });
      lines.push("#availability #appointments");
      return lines.join("\n").trim();
    }

    if (format === "plain") {
      return items
        .flatMap(([date, schedule]) =>
          schedule.slots.map((slot) => `${formatDateLabel(date)} ${slot.start}`)
        )
        .join("\n");
    }

    const lines = [];
    lines.push(`Month: ${appState.month}`);
    lines.push("");
    items.forEach(([date, schedule]) => {
      lines.push(formatDateLabel(date));
      schedule.slots.forEach((slot) => lines.push(`${listPrefix}${slot.start}`));
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function getListPrefix() {
    const trimmed = exportDivider.trim();
    if (!trimmed) return "- ";
    return exportDivider.endsWith(" ") ? exportDivider : `${exportDivider} `;
  }

  function getDefaultDivider(format) {
    return format === "grouped" ? "- " : ", ";
  }

  function formatDateLabel(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    if (exportDateFormat === "yyyy/mm/dd") return `${year}/${mm}/${dd}`;
    if (exportDateFormat === "mm/dd") return `${mm}/${dd}`;
    if (exportDateFormat === "m/d") return `${month}/${day}`;
    return `${year}-${mm}-${dd}`;
  }

  function selectedSchedules() {
    return Object.entries(state.schedules)
      .filter(([, schedule]) => schedule.enabled && schedule.slots.length > 0)
      .sort(([left], [right]) => left.localeCompare(right));
  }

  function exportIcs() {
    const items = selectedSchedules();
    if (!items.length) return setExportMessage("There are no slots to export.");

    const nowStamp = formatUtcDate(new Date());
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Timetabo//Appointment Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

    items.forEach(([date, schedule]) => {
      schedule.slots.forEach((slot) => {
        const uid = `${date.replace(/-/g, "")}-${slot.start.replace(":", "")}-${slot.id}@timetabo`;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${escapeIcs(uid)}`);
        lines.push(`DTSTAMP:${nowStamp}`);
        lines.push(`DTSTART:${formatLocalIcsDate(date, slot.start)}`);
        lines.push(`DTEND:${formatLocalIcsDateWithOffset(date, slot.start, exportDurationHours * 60)}`);
        lines.push(`SUMMARY:${escapeIcs("Available for appointment")}`);
        lines.push(`DESCRIPTION:${escapeIcs(`Status: ${slot.status}; Duration: ${exportDurationHours} hour(s)`)}`);
        lines.push("END:VEVENT");
      });
    });

    lines.push("END:VCALENDAR");
    downloadBlob(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }), `appointments-${state.month}.ics`);
    showToast("ICS downloaded");
  }

  function buildTimeOptions(start, end, stepMinutes) {
    const options = [];
    let current = toMinutes(start);
    const endValue = toMinutes(end);
    while (current <= endValue) {
      options.push(fromMinutes(current));
      current += stepMinutes;
    }
    return options;
  }

  function hasSlotAtTime(slots, time) {
    return slots.some((slot) => slot.start === time);
  }

  function addMinutesToTime(time, amount) {
    const next = toMinutes(time) + amount;
    if (next > toMinutes(TIME_OPTIONS[TIME_OPTIONS.length - 1])) return "";
    return fromMinutes(next);
  }

  function toMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function fromMinutes(total) {
    const hours = String(Math.floor(total / 60)).padStart(2, "0");
    const minutes = String(total % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getSchedule(date) {
    if (!state.schedules[date]) state.schedules[date] = { date, enabled: false, note: "", slots: [] };
    return state.schedules[date];
  }

  function compareSlots(left, right) {
    return `${left.start}${left.end}`.localeCompare(`${right.start}${right.end}`);
  }

  function createSlotId(date) {
    return `${date}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function toMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function firstDateOfMonth(monthKey) {
    return `${monthKey}-01`;
  }

  function findInitialSelectedDate() {
    const existing = selectedSchedules()[0];
    return existing ? existing[0] : firstDateOfMonth(state.month);
  }

  function isValidTime(value) {
    return /^\d{2}:\d{2}$/.test(value);
  }

  function formatUtcDate(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function formatLocalIcsDate(dateKey, time) {
    return `${dateKey.replace(/-/g, "")}T${time.replace(":", "")}00`;
  }

  function formatLocalIcsDateWithOffset(dateKey, time, offsetMinutes) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    const value = new Date(year, month - 1, day, hours, minutes + offsetMinutes, 0);
    return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}${String(value.getMinutes()).padStart(2, "0")}00`;
  }

  function escapeIcs(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function setMessage(message) {
    dom.editorMessage.textContent = message;
  }

  function setModalMessage(message) {
    dom.modalMessage.textContent = "";
    if (message) showToast(message);
  }

  function setExportMessage(message) {
    dom.exportMessage.textContent = "";
    if (message) showToast(message);
  }

  function showToast(message) {
    if (!dom.toast || !message) return;
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.remove("hidden");
    requestAnimationFrame(() => dom.toast.classList.add("is-visible"));
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
      window.setTimeout(() => dom.toast.classList.add("hidden"), 180);
    }, 1600);
  }
})();
