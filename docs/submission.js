// Google Sheets Apps Script submission bridge for the STATIC DEMO.
// no-cors responses are opaque: delivery cannot be verified by browser.
// Do not use for high-stakes examinations.
(() => {
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbxf6ZAwaa7U_uWHlntUb-Mw4_PQPBhRVn15e-lF-f8F6C7uOJLiUoZJDQL90ogFIbes/exec";
  const byId = id => document.getElementById(id);
  let running = false;
  function completed() {
    const done = byId("done");
    if (!done || done.classList.contains("hidden")) return;
    const score = byId("score"), download = byId("download");
    if (score) score.style.display = "none";
    if (download) download.style.display = "none";
    const oldNote = done.querySelector(".muted");
    if (oldNote) oldNote.style.display = "none";
    const summary = byId("summary");
    if (summary) summary.textContent = "Your exam is completed. Thank you for participating.";
    if (running) return;
    const sid = (byId("student")?.value || "").trim();
    const config = window.EXAM_CONFIG;
    if (!sid || !config) return;
    const k = "academic-exam-demo:" + config.title + ":" + sid;
    let record;
    try { record = JSON.parse(localStorage.getItem(k) || "null"); }
    catch { return; }
    if (!record?.result || !record.finished) return;
    running = true;
    const stateKey = k + ":sheet-sent";
    let notice = byId("submissionNotice");
    if (!notice) {
      notice = document.createElement("p");
      notice.id = "submissionNotice";
      done.appendChild(notice);
    }
    if (localStorage.getItem(stateKey)) {
      notice.textContent = "A submission request was already sent. Ask your instructor to verify receipt.";
      return;
    }
    notice.textContent = "Sending your submission…";
    const result = record.result;
    const info = {
      studentId: sid,
      examCode: config.examCode,
      exam: config.title,
      startedAt: new Date((record.deadline || Date.now()) - config.durationMinutes * 60000).toISOString(),
      submittedAt: result.submittedAt,
      durationMinutes: config.durationMinutes,
      answers: result.answers || {}
    };
    const body = new URLSearchParams({payload: JSON.stringify(info)});
    fetch(ENDPOINT, {method:"POST",mode:"no-cors",body})
      .then(() => {
        localStorage.setItem(stateKey, new Date().toISOString());
        notice.textContent = "Submission request sent. Your instructor must verify it appears in the results sheet.";
      })
      .catch(() => {
        notice.textContent = "Submission could not be sent. Keep this page open and contact your instructor.";
        running = false;
      });
  }
  new MutationObserver(completed).observe(document.documentElement, {subtree:true,attributes:true,attributeFilter:["class"]});
  document.addEventListener("DOMContentLoaded",completed);
})();
