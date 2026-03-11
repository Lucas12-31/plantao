import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const paginasProibidasFuncionario = ['cadastro.html', 'parceiros.html', 'producao.html'];
const paginasPermitidasCorretor = ['index.html', 'plantao.html', 'lojas.html', 'login.html'];
const paginaAtual = window.location.pathname.split('/').pop() || 'index.html';

// O Firebase fica "ouvindo" para ver se tem alguém logado
onAuthStateChanged(auth, (user) => {
    
    if (user) {
        const email = user.email.toLowerCase();
        
        // 1. DEFINIÇÃO DE PERFIS (A mágica acontece aqui)
        let perfilAtivo = 'corretor'; // Todo mundo que entra cai como corretor por padrão
        let nomeLogado = 'Corretor Associado';

        // Verifica se é a Mestre
        if (email === 'amanda.rossip@gmail.com') {
            perfilAtivo = 'mestre';
            nomeLogado = 'Gestão Mestre';
        } 
        // Verifica se é a Equipe Administrativa
        else if (email === 'equipelimao@gmail.com') {
            perfilAtivo = 'funcionario';
            nomeLogado = 'Administrativo';
        }

        // Se estiver na tela de login logado, joga pro início
        if (paginaAtual === 'login.html') {
            window.location.replace('index.html');
            return;
        }

        // 2. BLOQUEIO DE PÁGINAS (CHUTA PRO INÍCIO SE TENTAR INVADIR)
        if (perfilAtivo === 'funcionario' && paginasProibidasFuncionario.includes(paginaAtual)) {
            alert("⛔ Acesso Negado!\nSeu perfil não tem permissão para acessar esta área.");
            window.location.replace('index.html');
        }

        if (perfilAtivo === 'corretor' && !paginasPermitidasCorretor.includes(paginaAtual)) {
            alert("⛔ Acesso Restrito!\nVocê só tem permissão para visualizar as escalas do Plantão.");
            window.location.replace('index.html');
        }

        // 3. ESCONDER BOTÕES E MENUS
        if (perfilAtivo === 'funcionario' || perfilAtivo === 'corretor') {
            let linksParaEsconder = [];

            if (perfilAtivo === 'funcionario') {
                // Equipe não vê gestão pesada
                linksParaEsconder = document.querySelectorAll('a[href*="cadastro.html"], a[href*="parceiros.html"], a[href*="producao.html"]');
            } else if (perfilAtivo === 'corretor') {
                // Corretor não vê nada além de plantão e lojas
                linksParaEsconder = document.querySelectorAll('a[href*="cadastro.html"], a[href*="parceiros.html"], a[href*="producao.html"], a[href*="distribuicao.html"], a[href*="leads.html"]');
            }
            
            linksParaEsconder.forEach(link => {
                if (link.classList.contains('nav-link')) {
                    if (link.parentElement) link.parentElement.style.display = 'none';
                } else {
                    link.style.display = 'none'; // Esconde os cartões do dashboard
                }
            });

            // Tira as barrinhas de separação "|"
            document.querySelectorAll('.nav-item.text-secondary').forEach(barra => {
                if(barra.innerText.includes('|')) barra.style.display = 'none';
            });
        }

        // 4. BOTÃO DE SAIR NO MENU
        const navbar = document.querySelector('.navbar-nav');
        if (navbar && !document.getElementById('btn-sair-sistema')) {
            const liSair = document.createElement('li');
            liSair.className = 'nav-item ms-lg-3 mt-2 mt-lg-0 d-flex align-items-center';
            liSair.id = 'btn-sair-sistema';
            liSair.innerHTML = `
                <span class="text-white small me-3 d-none d-lg-block border-end border-secondary pe-3 text-nowrap">Olá, <b>${nomeLogado}</b></span>
                <button class="btn btn-sm btn-danger fw-bold px-3 shadow-sm text-nowrap" id="btn-logout">Sair 🚪</button>
            `;
            navbar.appendChild(liSair);

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
