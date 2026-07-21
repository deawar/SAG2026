/**
 * Gallery invitation acceptance page. Link arrives by email:
 *   /gallery-invite.html?grant=<id>&token=<raw>
 * Must be logged in as a TEACHER/SCHOOL_ADMIN of a same-band school to accept.
 * Band-mismatch / expired-token errors surface the backend's explicit message.
 */

document.addEventListener('DOMContentLoaded', () => {
  UIComponents.initializeNavbar();

  const statusEl = document.getElementById('invite-status');
  const actionsEl = document.getElementById('invite-actions');
  const successEl = document.getElementById('invite-success');
  const loginEl = document.getElementById('invite-login');

  const params = new URLSearchParams(window.location.search);
  const grantId = params.get('grant');
  const token = params.get('token');

  if (!grantId || !token) {
    statusEl.textContent = 'This invitation link is invalid or incomplete. Please use the link from your email.';
    return;
  }

  const user = window.authManager ? window.authManager.getUser() : null;
  if (!user) {
    statusEl.textContent = 'Please log in with your teacher or school-admin account, then open this invitation link again from your email.';
    loginEl.style.display = '';
    return;
  }
  if (user.role !== 'TEACHER' && user.role !== 'SCHOOL_ADMIN') {
    statusEl.textContent = 'Only a teacher or school admin can accept a gallery invitation.';
    return;
  }

  statusEl.textContent = 'Another school has invited your school to view their student art gallery.';
  actionsEl.style.display = '';

  const acceptBtn = document.getElementById('invite-accept-btn');
  acceptBtn.addEventListener('click', async () => {
    acceptBtn.disabled = true;
    statusEl.textContent = 'Accepting…';
    try {
      const data = await window.apiClient.post(
        '/api/gallery/grants/' + encodeURIComponent(grantId) + '/accept', { token });
      statusEl.textContent = 'Invitation accepted! You can now view the gallery and enable your students.';
      actionsEl.style.display = 'none';
      const link = document.getElementById('invite-gallery-link');
      if (link && data.hostSchoolId) {
        link.href = '/gallery.html?school=' + encodeURIComponent(data.hostSchoolId);
      }
      successEl.style.display = '';
    } catch (err) {
      acceptBtn.disabled = false;
      statusEl.textContent = err.message || 'Could not accept this invitation.';
    }
  });
});
