import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Pega o botão para criar um efeito de "Carregando"
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.innerHTML;
    
    // Desativa o botão temporariamente e avisa que está carregando
    btnSubmit.innerHTML = 'Entrando... ⏳';
    btnSubmit.disabled = true;

    const user = document.getElementById('user').value.toLowerCase().trim();
    const pass = document.getElementById('pass').value.trim();

    // Adiciona o domínio automaticamente se o usuário digitar apenas "mestre" ou "equipe"
    let email = user;
    if (!user.includes('@')) {
        email = `${user}@sistemalimao.com.br`;
    }

    try {
        // Tenta fazer o login seguro direto no servidor do Firebase
        await signInWithEmailAndPassword(auth, email, pass);
        
        // SUCESSO! Força o redirecionamento imediato para a tela inicial
        window.location.replace('index.html');
        
    } catch (error) {
        console.error(error);
        alert('❌ Usuário ou senha incorretos!');
        
        // Se der erro, devolve o botão ao normal para a pessoa tentar de novo
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
    }
});
