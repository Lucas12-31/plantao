// auth.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const paginasProibidasFuncionario = ['cadastro.html', 'parceiros.html', 'producao.html'];
const paginaAtual = window.location.pathname.split('/').pop() || 'index.html';

// O Firebase fica "ouvindo" para ver se tem alguém logado
onAuthStateChanged(auth, (user) => {
    
    // SE ALGUÉM ESTIVER LOGADO (Acesso Permitido)
    if (user) {
        const email = user.email;
        let perfilAtivo = 'funcionario';
        let nomeLogado = 'Administrativo';

        // Descobre quem é pelo e-mail
        if (email === 'mestre@sistemalimao.com.br') {
            perfilAtivo = 'mestre';
            nomeLogado = 'Gestão Mestre';
        }

        // Se o cara logado estiver na tela de login, joga ele pra página inicial
        if (paginaAtual === 'login.html') {
            window.location.replace('index.html');
            return;
        }

        // ⛔ BLOQUEIO DE PÁGINAS PARA A EQUIPE
        if (perfilAtivo === 'funcionario' && paginasProibidasFuncionario.includes(paginaAtual)) {
            alert("⛔ Acesso Negado!\nSeu perfil não tem permissão para acessar esta área.");
            window.location.replace('index.html');
        }

        // Esconde os botões proibidos do Menu
        if (perfilAtivo === 'funcionario') {
            const linksParaEsconder = document.querySelectorAll('a[href="cadastro.html"], a[href="parceiros.html"], a[href="producao.html"]');
            linksParaEsconder.forEach(link => {
                if(link.parentElement) link.parentElement.style.display = 'none';
            });
        }

        // Adiciona o Botão de Sair no Menu Superior (se já não estiver lá)
        const navbar = document.querySelector('.navbar-nav');
        if (navbar && !document.getElementById('btn-sair-sistema')) {
            const liSair = document.createElement('li');
            liSair.className = 'nav-item ms-3 d-flex align-items-center';
            liSair.id = 'btn-sair-sistema';
            liSair.innerHTML = `
                <span class="text-white small me-3 d-none d-lg-block border-end pe-3">Olá, <b>${nomeLogado}</b></span>
                <button class="btn btn-sm btn-danger fw-bold px-3 shadow-sm" id="btn-logout">Sair 🚪</button>
            `;
            navbar.appendChild(liSair);

            // Ação do Botão Sair usando o Firebase
            document.getElementById('btn-logout').addEventListener('click', () => {
                if(confirm("Deseja realmente sair do sistema?")) {
                    signOut(auth).then(() => {
                        window.location.replace('login.html');
                    });
                }
            });
        }
    } 
    // SE NINGUÉM ESTIVER LOGADO (Acesso Negado)
    else {
        if (paginaAtual !== 'login.html') {
            window.location.replace('login.html');
        }
    }
});
