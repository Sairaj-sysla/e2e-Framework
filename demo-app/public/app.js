const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const welcome = document.getElementById('welcome');

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function showDashboard(user) {
  welcome.textContent = `Welcome, ${user.name}!`;
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function showLogin() {
  form.reset();
  errorBox.hidden = true;
  dashboardView.hidden = true;
  loginView.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    showError('Email and password are required.');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (res.ok) showDashboard(body);
    else showError(body.error ?? 'Login failed.');
  } catch {
    showError('Could not reach the server. Try again.');
  }
});

document.getElementById('logout').addEventListener('click', showLogin);
