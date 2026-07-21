/**
 * School Gallery management (TEACHER / SCHOOL_ADMIN):
 *  - host: comment moderation queue, roster, cross-school invitations + revoke
 *  - invited teacher: enable/disable own students per accepted grant
 * All user-derived text via DOM APIs / .textContent (XSS rule).
 */

let _viewer = null;
/** registered students of this teacher: [{ userId, studentName }] */
let _students = [];

/* ========================= Moderation queue ========================= */

async function loadPending() {
  const list = document.getElementById('pending-list');
  const count = document.getElementById('pending-count');
  list.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/comments/pending');
    const rows = (data && data.comments) ? data.comments : [];
    count.textContent = String(rows.length);
    if (rows.length === 0) {
      const li = document.createElement('li');
      li.className = 'comment-thread__empty';
      li.textContent = 'No comments waiting.';
      list.appendChild(li);
      return;
    }
    rows.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'comment-thread__item';
      const head = document.createElement('p');
      const author = document.createElement('strong');
      author.textContent = c.authorFirstName || 'A student';
      head.appendChild(author);
      const origin = document.createElement('span');
      origin.textContent = (c.authorOrigin === 'CROSS_SCHOOL' ? ' (another school)' : '') +
        ' on “' + (c.itemTitle || 'Untitled') + '”';
      head.appendChild(origin);
      li.appendChild(head);
      const bodyP = document.createElement('p');
      bodyP.textContent = c.body;
      li.appendChild(bodyP);
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '0.5rem';
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'btn btn-primary btn-sm';
      approve.textContent = 'Approve';
      approve.addEventListener('click', () => moderate(c.id, 'approve'));
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'btn btn-secondary btn-sm';
      reject.textContent = 'Reject';
      reject.addEventListener('click', () => moderate(c.id, 'reject'));
      actions.appendChild(approve);
      actions.appendChild(reject);
      li.appendChild(actions);
      list.appendChild(li);
    });
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load the moderation queue.';
    list.appendChild(li);
  }
}

async function moderate(commentId, action) {
  try {
    await window.apiClient.post('/api/gallery/comments/' + encodeURIComponent(commentId) + '/' + action, {});
    UIComponents.showAlert(action === 'approve' ? 'Comment approved.' : 'Comment rejected.', 'success');
    loadPending();
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not moderate that comment.', 'error');
  }
}

/* ============================= Roster ============================== */

async function loadRoster() {
  const list = document.getElementById('roster-list');
  list.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/roster');
    const roster = (data && data.roster) ? data.roster : [];
    populateStudentSelect(roster);
    if (roster.length === 0) {
      const li = document.createElement('li');
      li.className = 'comment-thread__empty';
      li.textContent = 'No students on the roster yet.';
      list.appendChild(li);
      return;
    }
    roster.forEach((s) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '0.35rem 0';
      const name = document.createElement('span');
      name.textContent = ((s.firstName || '') + ' ' + (s.lastName || '')).trim() +
        (s.gradeLevel ? ' · ' + s.gradeLevel : '');
      li.appendChild(name);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-secondary btn-sm';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        try {
          await window.apiClient.delete('/api/gallery/roster/' + encodeURIComponent(s.studentUserId));
          UIComponents.showAlert('Removed from the roster. Their shared items leave the gallery immediately.', 'success');
          loadRoster();
        } catch (err) {
          UIComponents.showAlert(err.message || 'Could not remove that student.', 'error');
        }
      });
      li.appendChild(remove);
      list.appendChild(li);
    });
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load the roster.';
    list.appendChild(li);
  }
}

/** Fill the add-student select with registered students NOT already rostered. */
function populateStudentSelect(roster) {
  const select = document.getElementById('roster-student-select');
  if (!select) { return; }
  const onRoster = new Set(roster.map((s) => s.studentUserId));
  select.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = _students.length ? 'Choose a student…' : 'No registered students found';
  select.appendChild(placeholder);
  _students
    .filter((s) => s.userId && !onRoster.has(s.userId))
    .forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.userId;
      opt.textContent = s.studentName || s.studentEmail || s.userId;
      select.appendChild(opt);
    });
}

async function addToRoster() {
  const select = document.getElementById('roster-student-select');
  const studentUserId = select ? select.value : '';
  if (!studentUserId) {
    UIComponents.showAlert('Choose a student first.', 'error');
    return;
  }
  try {
    await window.apiClient.post('/api/gallery/roster', { studentUserId });
    UIComponents.showAlert('Student added to the gallery roster.', 'success');
    loadRoster();
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not add that student.', 'error');
  }
}

/* ======================= Grants (host side) ======================== */

async function loadGrants() {
  const hostList = document.getElementById('host-grants-list');
  const invitedBox = document.getElementById('invited-grants');
  hostList.textContent = '';
  invitedBox.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/grants');
    renderHostGrants((data && data.host) ? data.host : [], hostList);
    renderInvitedGrants((data && data.invited) ? data.invited : [], invitedBox);
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load invitations.';
    hostList.appendChild(li);
  }
}

function renderHostGrants(grants, list) {
  if (grants.length === 0) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = 'No invitations sent yet.';
    list.appendChild(li);
    return;
  }
  grants.forEach((g) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '0.35rem 0';
    const label = document.createElement('span');
    label.textContent = g.invited_email + ' — ' + g.status;
    li.appendChild(label);
    if (g.status === 'PENDING' || g.status === 'ACCEPTED') {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'btn btn-secondary btn-sm';
      revoke.textContent = 'Revoke';
      revoke.addEventListener('click', async () => {
        try {
          await window.apiClient.post('/api/gallery/grants/' + encodeURIComponent(g.id) + '/revoke', {});
          UIComponents.showAlert('Access revoked. It stops working immediately.', 'success');
          loadGrants();
        } catch (err) {
          UIComponents.showAlert(err.message || 'Could not revoke.', 'error');
        }
      });
      li.appendChild(revoke);
    }
    list.appendChild(li);
  });
}

async function sendInvite() {
  const input = document.getElementById('invite-email-input');
  const invitedEmail = input ? input.value.trim() : '';
  if (!invitedEmail) {
    UIComponents.showAlert('Enter the email to invite.', 'error');
    return;
  }
  try {
    const data = await window.apiClient.post('/api/gallery/grants', { invitedEmail });
    if (input) { input.value = ''; }
    UIComponents.showAlert(data.inviteSent === false
      ? 'Invitation created, but the email could not be sent — share the link manually.'
      : 'Invitation sent.', 'success');
    loadGrants();
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not send the invitation.', 'error');
  }
}

/* ================== Enablement (invited-teacher side) ================== */

function renderInvitedGrants(grants, box) {
  const accepted = grants.filter((g) => g.status === 'ACCEPTED');
  if (accepted.length === 0) {
    const p = document.createElement('p');
    p.className = 'comment-thread__empty';
    p.textContent = 'No other school has shared a gallery with you.';
    box.appendChild(p);
    return;
  }
  accepted.forEach((g) => {
    const section = document.createElement('div');
    section.style.marginBottom = '1rem';
    const head = document.createElement('p');
    const link = document.createElement('a');
    link.href = '/gallery.html?school=' + encodeURIComponent(g.host_school_id);
    link.textContent = 'View shared gallery';
    head.appendChild(link);
    section.appendChild(head);
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    section.appendChild(ul);
    box.appendChild(section);
    renderEnablement(g, ul);
  });
}

async function renderEnablement(grant, ul) {
  let enabled = new Set();
  try {
    const data = await window.apiClient.get('/api/gallery/grants/' + encodeURIComponent(grant.id) + '/members');
    enabled = new Set(((data && data.members) || []).map((m) => m.studentUserId));
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load enabled students.';
    ul.appendChild(li);
    return;
  }
  const registered = _students.filter((s) => s.userId);
  if (registered.length === 0) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = 'No registered students to enable.';
    ul.appendChild(li);
    return;
  }
  registered.forEach((s) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'portfolio-gallery-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = enabled.has(s.userId);
    cb.setAttribute('aria-label', 'Allow ' + (s.studentName || 'student') + ' to view the shared gallery');
    const name = document.createElement('span');
    name.textContent = s.studentName || s.studentEmail || s.userId;
    label.appendChild(cb);
    label.appendChild(name);
    li.appendChild(label);
    ul.appendChild(li);
    cb.addEventListener('change', async () => {
      try {
        if (cb.checked) {
          await window.apiClient.post('/api/gallery/grants/' + encodeURIComponent(grant.id) + '/members',
            { studentUserId: s.userId });
        } else {
          await window.apiClient.delete('/api/gallery/grants/' + encodeURIComponent(grant.id) + '/members/' +
            encodeURIComponent(s.userId));
        }
      } catch (err) {
        cb.checked = !cb.checked;
        UIComponents.showAlert(err.message || 'Could not update that student.', 'error');
      }
    });
  });
}

/* ================================ Init ================================== */

document.addEventListener('DOMContentLoaded', async () => {
  UIComponents.requireAuth('/');
  UIComponents.initializeNavbar();

  _viewer = window.authManager ? window.authManager.getUser() : null;
  if (!_viewer || (_viewer.role !== 'TEACHER' && _viewer.role !== 'SCHOOL_ADMIN')) {
    window.location.href = '/gallery.html';
    return;
  }

  const addBtn = document.getElementById('roster-add-btn');
  if (addBtn) { addBtn.addEventListener('click', addToRoster); }
  const inviteBtn = document.getElementById('invite-send-btn');
  if (inviteBtn) { inviteBtn.addEventListener('click', sendInvite); }

  // Student list first (roster select + enablement need it); TEACHER only —
  // SCHOOL_ADMIN has no /api/teacher/students scope.
  if (_viewer.role === 'TEACHER') {
    // Best-effort: a failure just leaves the pickers empty.
    const data = await window.apiClient.get('/api/teacher/students').catch(() => null);
    _students = (data && data.registered) ? data.registered : [];
  }

  loadPending();
  loadRoster();
  loadGrants();
});
