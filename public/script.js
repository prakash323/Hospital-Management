let selectedRole = 'patient';

function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('signupForm').style.display = 'none';
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('signupTab').classList.remove('active');
}

function showSignup() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'block';
  document.getElementById('loginTab').classList.remove('active');
  document.getElementById('signupTab').classList.add('active');
}

function selectRole(element, role) {
  selectedRole = role;
  const roleInput = document.getElementById('roleInput');
  if (roleInput) {
    roleInput.value = role;
  }
  document.querySelectorAll('.role').forEach(r => r.classList.remove('active-role'));
  element.classList.add('active-role');

  const box = document.getElementById('specializationBox');
  if (box) {
    box.style.display = role === 'doctor' ? 'block' : 'none';
  }
}

function highlightSidebarItem() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-item').forEach(item => {
    if (item.getAttribute('href') === path) {
      item.classList.add('active');
    }
  });
}

window.onload = function () {
  if (document.getElementById('loginTab')) {
    showLogin();
    const roleInput = document.getElementById('roleInput');
    if (roleInput) roleInput.value = selectedRole;
  }
  highlightSidebarItem();
};
