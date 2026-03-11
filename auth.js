import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const paginasProibidasFuncionario = ['cadastro.html', 'parceiros.html', 'producao.html'];
const paginasPermitidasCorretor = ['index.html', 'plantao.html', 'lojas.html', 'login.html'];
const paginaAtual = window.location.pathname.split('/').pop() || 'index.html';

// O Firebase fica "ouvindo" para ver se tem alguém logado
onAuthStateChanged(auth, (user) => {
    
    if (user) {
        const email = user.email.toLowerCase();
        
        // 1. DEFINIÇÃO DE PERFIS
        let perfilAtivo = 'corretor'; 
        let nomeLogado = 'Corretor Associado';

        if (email === 'amanda.rossip@gmail.com') {
            perfilAtivo = 'mestre';
            nomeLogado = 'Gestão Mestre';
        } else if (email === 'equipelimao@gmail.com') {
            perfilAtivo = 'funcionario';
            nomeLogado = 'Administrativo';
        }

        if (paginaAtual === 'login.html') {
            window.location.replace('index.html');
            return;
        }

        // 2. BLOQUEIO DE PÁGINAS
        if (perfilAtivo === 'funcionario' && paginasProibidasFuncionario.includes(paginaAtual)) {
            alert("⛔ Acesso Negado!\nSeu perfil não tem permissão para acessar esta área.");
            window.location.replace('index.html');
        }

        if (perfilAtivo === 'corretor' && !paginasPermitidasCorretor.includes(paginaAtual)) {
            alert("⛔ Acesso Restrito!\nVocê só tem permissão para visualizar as escalas do Plantão.");
            window.location.replace('index.html');
        }

        // 3. ESCONDER BOTÕES E MENUS GERAIS
        if (perfilAtivo === 'funcionario' || perfilAtivo === 'corretor') {
            let linksParaEsconder = [];

            if (perfilAtivo === 'funcionario') {
                linksParaEsconder = document.querySelectorAll('a[href*="cadastro.html"], a[href*="parceiros.html"], a[href*="producao.html"]');
            } else if (perfilAtivo === 'corretor') {
                linksParaEsconder = document.querySelectorAll('a[href*="cadastro.html"], a[href*="parceiros.html"], a[href*="producao.html"], a[href*="distribuicao.html"], a[href*="leads.html"]');
            }
            
            linksParaEsconder.forEach(link => {
                if (link.classList.contains('nav-link')) {
                    if (link.parentElement) link.parentElement.style.display = 'none';
                } else {
                    link.style.display = 'none'; 
                }
            });

            document.querySelectorAll('.nav-item.text-secondary').forEach(barra => {
                if(barra.innerText.includes('|')) barra.style.display = 'none';
            });
        }

        // =========================================================
        // 4. NOVO: MODO "SOMENTE LEITURA" PARA A ESCALA DO CORRETOR
        // =========================================================
        if (perfilAtivo === 'corretor') {
            // Cria um CSS que força os botões de edição a sumirem
            const estiloBloqueio = document.createElement('style');
            estiloBloqueio.innerHTML = `
                button[onclick="refazerSorteio()"], 
                button[onclick*="alterarVagas"], 
                #form-feriado, 
                button[onclick*="deletarFeriado"] {
                    display: none !important;
                }
            `;
            // Injeta o CSS na página secretamente
            document.head.appendChild(estiloBloqueio);
        }

        // 5. BOTÃO DE SAIR NO MENU
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
    } else {
        if (paginaAtual !== 'login.html') {
            window.location.replace('login.html');
        }
    }
});
