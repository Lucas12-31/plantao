// app-login.js
document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Pega o que foi digitado e converte para minúsculo para não dar erro se digitar com CapsLock
    const user = document.getElementById('user').value.toLowerCase().trim();
    const pass = document.getElementById('pass').value.trim();

    // 👑 1. ACESSO MESTRE (CLIENTE)
    // Tem acesso a TUDO.
    if (user === 'mestre' && pass === 'limao2026') {
        localStorage.setItem('limao_perfil', 'mestre');
        localStorage.setItem('limao_nome', 'Gestão Mestre');
        window.location.href = 'index.html';
    } 
    
    // 👨‍💻 2. ACESSO ADMINISTRATIVO (FUNCIONÁRIO)
    // Tem acesso SÓ a: Distribuição, Plantão, Leads e Lojas.
    else if (user === 'equipe' && pass === 'equipe2026') {
        localStorage.setItem('limao_perfil', 'funcionario');
        localStorage.setItem('limao_nome', 'Administrativo');
        window.location.href = 'index.html';
    } 
    
    // ❌ ERRO
    else {
        alert('❌ Usuário ou senha incorretos! Tente novamente.');
    }
});
