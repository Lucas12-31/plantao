// auth.js

// Verifica quem está logado no navegador
const perfilAtivo = localStorage.getItem('limao_perfil');

// 1. SE NÃO TIVER LOGADO, CHUTA PARA O LOGIN NA HORA
// Só não chuta se já estiver na página de login, pra não dar loop infinito
if (!perfilAtivo && !window.location.pathname.includes('login.html')) {
    window.location.replace('login.html');
}

// 2. REGRAS DE BLOQUEIO PARA O FUNCIONÁRIO (RBAC)
const paginasProibidasFuncionario = ['cadastro.html', 'parceiros.html', 'producao.html'];
const paginaAtual = window.location.pathname.split('/').pop();

// Se for funcionário e tentar acessar uma página proibida, bloqueia e manda pro início
if (perfilAtivo === 'funcionario' && paginasProibidasFuncionario.includes(paginaAtual)) {
    alert("⛔ Acesso Negado!\nSeu perfil não tem permissão para acessar esta área.");
    window.location.replace('index.html'); // Manda de volta pra Home
}

// 3. ALTERAÇÕES VISUAIS DEPOIS QUE A PÁGINA CARREGA
window.addEventListener('DOMContentLoaded', () => {
    
    // Se for funcionário, apaga os botões do menu superior!
    if (perfilAtivo === 'funcionario') {
        const linksParaEsconder = document.querySelectorAll('a[href="cadastro.html"], a[href="parceiros.html"], a[href="producao.html"]');
        
        linksParaEsconder.forEach(link => {
            // Esconde o 'li' (item da lista) inteiro para não ficar buraco no menu
            if(link.parentElement) {
                link.parentElement.style.display = 'none';
            }
        });
    }

    // Adiciona o Botão de "Sair / Logout" no canto direito do Menu
    const navbar = document.querySelector('.navbar-nav');
    if (navbar && !window.location.pathname.includes('login.html')) {
        const nomeLogado = localStorage.getItem('limao_nome') || 'Usuário';
        
        const liSair = document.createElement('li');
        liSair.className = 'nav-item ms-3 d-flex align-items-center';
        liSair.innerHTML = `
            <span class="text-white small me-3 d-none d-lg-block border-end pe-3">Olá, <b>${nomeLogado}</b></span>
            <a class="btn btn-sm btn-danger fw-bold px-3 shadow-sm" href="#" onclick="fazerLogout(event)">Sair 🚪</a>
        `;
        navbar.appendChild(liSair);
    }
});

// Função de Sair
window.fazerLogout = (e) => {
    if(e) e.preventDefault();
    if(confirm("Deseja realmente sair do sistema?")) {
        localStorage.removeItem('limao_perfil');
        localStorage.removeItem('limao_nome');
        window.location.replace('login.html');
    }
};
