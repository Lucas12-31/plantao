// app-login.js
import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = document.getElementById('user').value.toLowerCase().trim();
    const pass = document.getElementById('pass').value.trim();

    // Como o Firebase exige e-mail, a gente adiciona o domínio automaticamente 
    // se o usuário digitar apenas "mestre" ou "equipe"
    let email = user;
    if (!user.includes('@')) {
        email = `${user}@sistemalimao.com.br`;
    }

    try {
        // Tenta fazer o login seguro direto no servidor do Firebase
        await signInWithEmailAndPassword(auth, email, pass);
        // Se der certo, o auth.js (no próximo passo) vai detectar e redirecionar a página!
    } catch (error) {
        console.error(error);
        alert('❌ Usuário ou senha incorretos!');
    }
});
