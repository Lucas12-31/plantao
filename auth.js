import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const paginasProibidasFuncionario = ['cadastro.html', 'parceiros.html', 'producao.html'];
const paginaAtual = window.location.pathname.split('/').pop() || 'index.html';

// O Firebase fica "ouvindo" para ver se tem alguém logado
onAuthStateChanged(auth, (user) => {
    
    // SE ALGUÉM ESTIVER LOGADO (Acesso Permitido)
    if (user) {
        const email = user.email.toLowerCase();
        let perfilAtivo = 'funcionario';
        let nomeLogado = 'Administrativo';

        // 👑 REGRA DO MESTRE: Verificando o e-mail exato
        if (email === 'amanda.rossip@gmail.com') {
            perfilAtivo = 'mestre';
            nomeLogado = 'Gestão Mestre';
        }

        // Se estiver na tela de login logado, joga pro início
        if (paginaAtual === 'login.html') {
            window.location.replace('index.html');
            return;
        }

        // ⛔ BLOQUEIO DE PÁGINAS PARA A EQUIPE
        if (perfilAtivo === 'funcionario' && paginasProibidasFuncionario.includes(paginaAtual)) {
            alert("⛔ Acesso Negado!\nSeu perfil não tem permissão para acessar esta área.");
            window.location.replace('index.html');
        }

        // 👻 ESCONDER BOTÕES PARA A EQUIPE
        if (perfilAtivo === 'funcionario') {
            // Usa o asterisco *= para pegar o botão independente de como o link foi escrito
            const linksParaEsconder = document.querySelectorAll('a[href*="cadastro.html"], a[href*="parceiros.html"], a[href*="producao.html"]');
            
            linksParaEsconder.forEach(link => {
                if (link.classList.contains('nav-link')) {
                    // Se for link do Menu Superior (esconde o item da lista)
                    if (link.parentElement) link.parentElement.style.display = 'none';
                } else {
                    // Se for o botão grande colorido da tela inicial (esconde ele mesmo)
                    link.style.display = 'none';
                }
            });

            // Tira aquela barrinha "|" do menu para não ficar feio
            document.querySelectorAll('.nav-item.text-secondary').forEach(barra => {
                if(barra.innerText.includes('|')) barra.style.display = 'none';
            });
        }

        // 🚪 ADICIONA O BOTÃO DE SAIR NO MENU (Se já não existir)
        const navbar = document.querySelector('.navbar-nav');
        if (navbar && !document.getElementById('btn-sair-sistema')) {
            const liSair = document.createElement('li');
            liSair.className = 'nav-item ms-lg-4 mt-2 mt-lg-0 d-flex align-items-center';
            liSair.id = 'btn-sair-sistema';
            liSair.innerHTML = `
                <span class="text-white small me-3 d-none d-lg-block border-end border-secondary pe-3">Olá, <b>${nomeLogado}</b></span>
                <button class="btn btn-sm btn-danger fw-bold px-3 shadow-sm w-100" id="btn-logout">Sair 🚪</button>
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
