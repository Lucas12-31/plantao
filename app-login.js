import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.innerHTML;
    
    btnSubmit.innerHTML = 'Entrando... ⏳';
    btnSubmit.disabled = true;

    // Agora pega o e-mail completo que a pessoa digitar
    const email = document.getElementById('user').value.toLowerCase().trim();
    const pass = document.getElementById('pass').value.trim();

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.replace('index.html');
    } catch (error) {
        console.error(error);
        alert('❌ E-mail ou senha incorretos!');
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
    }
});
