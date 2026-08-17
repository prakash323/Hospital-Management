let selectedRole = "patient";

function showLogin() {
    document.getElementById("loginForm").style.display = "block";
    document.getElementById("signupForm").style.display = "none";

    document.getElementById("loginTab").style.background = "black";
    document.getElementById("signupTab").style.background = "#ccc";
}

function showSignup() {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("signupForm").style.display = "block";

    document.getElementById("signupTab").style.background = "black";
    document.getElementById("loginTab").style.background = "#ccc";
}

// Show password
function togglePassword(id) {
    let input = document.getElementById(id);
    input.type = input.type === "password" ? "text" : "password";
}

// Role selection

function selectRole(element, role) {

    console.log("Selected role:", role); // DEBUG

    document.getElementById("roleInput").value = role;

    // remove highlight
    document.querySelectorAll(".role").forEach(r => r.classList.remove("active-role"));

    // add highlight
    element.classList.add("active-role");

    // SHOW / HIDE specialization
    const box = document.getElementById("specializationBox");

    if (role === "doctor") {
        box.style.display = "block";
    } else {
        box.style.display = "none";
    }
}


// Validation helpers
function isValidEmail(email) {
    return email.includes("@") && email.includes(".");
}

// Signup validation
// function signup() {
//     let name = document.getElementById("name").value;
//     let email = document.getElementById("email").value;
//     let password = document.getElementById("password").value;

//     if (name.length < 3) {
//         return showError("signupError", "Name must be at least 3 characters");
//     }

//     if (!isValidEmail(email)) {
//         return showError("signupError", "Invalid email");
//     }

//     if (password.length < 6) {
//         return showError("signupError", "Password must be at least 6 characters");
//     }

//     alert("Signup Successful (frontend demo)");
// }

// Login validation
function login() {
    let email = document.getElementById("loginEmail").value;
    let password = document.getElementById("loginPassword").value;

    if (!isValidEmail(email)) {
        return showError("loginError", "Enter valid email");
    }

    if (password.length < 3) {
        return showError("loginError", "Invalid password");
    }

    alert("Login Successful (connect backend next)");
}

// Error display
function showError(id, msg) {
    document.getElementById(id).innerText = msg;
}
function selectRole(element, role) {
    document.getElementById("roleInput").value = role;

    document.querySelectorAll(".role").forEach(r => r.classList.remove("active-role"));
    element.classList.add("active-role");
}
window.onload = function() {
    showLogin();
}