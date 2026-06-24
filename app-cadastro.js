import { db, auth } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// TRUQUE SÊNIOR: Cria um "App Secundário" invisível só para criar a conta do corretor
// sem derrubar o login da Gestão Mestre!
const appSecundario = initializeApp(auth.app.options, "AppCriadorDeContas");
const authSecundario = getAuth(appSecundario);

const form = document.getElementById('form-corretor');
const lista = document.getElementById('lista-corretores');

// ==========================================
// FUNÇÕES UNIVERSAIS DE ALERTAS BONITOS
// ==========================================
window.mostrarAlerta = (titulo, mensagem) => {
    document.getElementById('modal-alerta-titulo').innerText = titulo;
    document.getElementById('modal-alerta-mensagem').innerHTML = mensagem;
    new bootstrap.Modal(document.getElementById('modal-alerta')).show();
};

window.mostrarConfirmacao = (titulo, mensagem, callbackSim, corBtn = 'btn-success', textoBtn = 'Confirmar') => {
    document.getElementById('modal-confirmacao-titulo').innerText = titulo;
    document.getElementById('modal-confirmacao-mensagem').innerHTML = mensagem;
    
    const btn = document.getElementById('btn-confirmar-acao');
    btn.className = `btn fw-bold px-4 shadow-sm ${corBtn}`;
    btn.innerText = textoBtn;
    
    const novoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(novoBtn, btn);
    
    const modalConfirm = new bootstrap.Modal(document.getElementById('modal-confirmacao'));
    
    novoBtn.onclick = () => {
        modalConfirm.hide();
        callbackSim();
    };
    
    modalConfirm.show();
};

// ==========================================
// 1. CADASTRAR NOVO CORRETOR
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome-corretor').value.trim();
    const telefone = document.getElementById('telefone-corretor').value.trim();
    const email = document.getElementById('email-corretor').value.trim();

    try {
        await addDoc(collection(db, "corretores"), {
            nome: nome,
            telefone: telefone,
            email: email, 
            producao_pme: 0,
            producao_pf: 0,
            saldo_pme: 0,
            saldo_pf: 0,
            elegivel: true, // Começa ativo por padrão
            status: 'ativo',
            data_cadastro: new Date().toISOString()
        });

        window.mostrarAlerta("Cadastrado! ✅", "O corretor foi adicionado à equipe com sucesso!");
        form.reset();
        
        const modalEl = document.getElementById('modal-cadastrar-corretor');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

    } catch (error) {
        console.error("Erro ao cadastrar corretor:", error);
        window.mostrarAlerta("Erro", "Falha na conexão ao tentar cadastrar o corretor.");
    }
});

// ==========================================
// 2. LISTAR EQUIPE COM BOTÕES SEPARADOS
// ==========================================
onSnapshot(q, (snapshot) => {
    let html = '';
    
    if (snapshot.empty) {
        lista.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">Nenhum corretor cadastrado.</td></tr>';
        return;
    }

    snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const dados = docSnap.data();
        
        // Regras de Status
        const isAtivo = dados.ativo !== false; // Se undefined, considera true
        const participaPlantao = dados.participa_plantao !== false;

        const telBadge = dados.telefone ? `<span class="fw-bold text-secondary">${dados.telefone}</span>` : `<span class="badge bg-light text-muted border">Sem número</span>`;
        const emailBadge = dados.email ? `<span class="text-muted small">${dados.email}</span>` : `<span class="badge bg-light text-muted border">Sem e-mail</span>`;

        // Estilo Visual
        let nomeDisplay = isAtivo ? dados.nome : `<span class="text-decoration-line-through text-muted">${dados.nome}</span> <span class="badge bg-secondary ms-1" style="font-size:0.6rem;">INATIVO</span>`;
        let classRow = isAtivo ? "" : "bg-light opacity-75";

        // Botões
        let btnAcesso = dados.email && isAtivo ? `<button onclick="gerarAcessoCorretor('${dados.nome}', '${dados.email}')" class="btn btn-outline-info btn-sm me-1 fw-bold shadow-sm" title="Criar Login">🔑</button>` : '';
        let btnStatusEquipe = isAtivo 
            ? `<button onclick="toggleAtivo('${id}', '${dados.nome}', true)" class="btn btn-outline-secondary btn-sm me-1 fw-bold shadow-sm" title="Inativar da Equipe">⏸️</button>`
            : `<button onclick="toggleAtivo('${id}', '${dados.nome}', false)" class="btn btn-outline-success btn-sm me-1 fw-bold shadow-sm" title="Reativar na Equipe">▶️</button>`;
        
        let btnStatusPlantao = participaPlantao
            ? `<button onclick="togglePlantao('${id}', '${dados.nome}', true)" class="btn btn-outline-warning btn-sm me-1 fw-bold shadow-sm" title="Suspender do Plantão">⛔</button>`
            : `<button onclick="togglePlantao('${id}', '${dados.nome}', false)" class="btn btn-outline-primary btn-sm me-1 fw-bold shadow-sm" title="Permitir no Plantão">✅</button>`;

        html += `
            <tr class="${classRow}">
                <td class="text-start ps-4 fw-bold text-uppercase text-dark">${nomeDisplay} ${participaPlantao ? '' : '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem;">SUSPENSO PLANTÃO</span>'}</td>
                <td class="align-middle">${telBadge}</td>
                <td class="align-middle">${emailBadge}</td>
                <td class="align-middle text-nowrap">
                    ${btnAcesso}
                    <button onclick="abrirModalEditarCorretor('${id}', '${dados.nome}', '${dados.telefone || ''}', '${dados.email || ''}')" class="btn btn-outline-warning btn-sm me-1 fw-bold shadow-sm" title="Editar">✏️</button>
                    ${btnStatusEquipe}
                    ${btnStatusPlantao}
                    <button onclick="deletarCorretor('${id}', '${dados.nome}')" class="btn btn-outline-danger btn-sm fw-bold shadow-sm" title="Excluir Definitivamente">🗑️</button>
                </td>
            </tr>
        `;
    });
    lista.innerHTML = html;
});

// ==========================================
// 3. FUNÇÕES DE CONTROLE DE STATUS
// ==========================================
window.toggleAtivo = async (id, nome, ativoAtual) => {
    window.mostrarConfirmacao("Status Equipe", `Deseja ${ativoAtual ? 'inativar' : 'reativar'} o corretor <b>${nome}</b>?`, async () => {
        await updateDoc(doc(db, "corretores", id), { ativo: !ativoAtual });
    }, ativoAtual ? 'btn-secondary' : 'btn-success', ativoAtual ? '⏸️ Inativar' : '▶️ Reativar');
};

window.togglePlantao = async (id, nome, participaAtual) => {
    window.mostrarConfirmacao("Status Plantão", `Deseja ${participaAtual ? 'suspender' : 'permitir'} o corretor <b>${nome}</b> nas escalas?`, async () => {
        await updateDoc(doc(db, "corretores", id), { participa_plantao: !participaAtual });
    }, participaAtual ? 'btn-warning' : 'btn-primary', participaAtual ? '⛔ Suspender' : '✅ Permitir');
};

// ==========================================
// 4. FUNÇÃO DE CRIAR ACESSO NO FIREBASE
// ==========================================
window.gerarAcessoCorretor = async (nome, emailCorretor) => {
    let msg = `O e-mail de login será: <br><b>${emailCorretor}</b><br><br>Digite uma senha (mínimo de 6 caracteres) que este corretor usará para entrar no sistema:<br><input type="password" id="input-senha-acesso" class="form-control mt-3 text-center fw-bold border-info" placeholder="******">`;

    window.mostrarConfirmacao("🔑 Criar Acesso do Corretor", msg, async () => {
        const senha = document.getElementById('input-senha-acesso').value;
        if (!senha || senha.length < 6) return window.mostrarAlerta("Atenção ⚠️", "A senha precisa ter pelo menos 6 caracteres!");

        try {
            // Cria a conta do corretor direto nos servidores do Google
            await createUserWithEmailAndPassword(authSecundario, emailCorretor, senha);
            
            // Desloga o app secundário para garantir segurança
            await signOut(authSecundario);
            
            window.mostrarAlerta("Acesso Criado! ✅", `Envie as credenciais abaixo para o corretor:<br><br><b>Site:</b> (O link do seu sistema)<br><b>E-mail:</b> ${emailCorretor}<br><b>Senha:</b> ${senha}`);
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                window.mostrarAlerta("E-mail em uso ⚠️", "Este e-mail já tem um acesso criado no sistema! Se ele esqueceu a senha, precisaremos redefinir pelo painel do Firebase.");
            } else {
                window.mostrarAlerta("Erro de Criação", "Falha ao criar acesso. Verifique se o e-mail digitado é válido.");
            }
        }
    }, 'btn-info text-white', '🔑 Criar Acesso');
};

// ==========================================
// 5. EDITAR E EXCLUIR CORRETOR
// ==========================================
window.abrirModalEditarCorretor = (id, nome, telefone, email) => {
    document.getElementById('edit-id-corretor').value = id;
    document.getElementById('edit-nome-corretor').value = nome;
    document.getElementById('edit-telefone-corretor').value = telefone;
    document.getElementById('edit-email-corretor').value = email;

    new bootstrap.Modal(document.getElementById('modal-editar-corretor')).show();
};

window.salvarEdicaoCorretor = async () => {
    const id = document.getElementById('edit-id-corretor').value;
    const novoNome = document.getElementById('edit-nome-corretor').value.trim();
    const novoTelefone = document.getElementById('edit-telefone-corretor').value.trim();
    const novoEmail = document.getElementById('edit-email-corretor').value.trim();

    if (!novoNome) return window.mostrarAlerta("Atenção", "O nome do corretor não pode ficar em branco.");

    try {
        await updateDoc(doc(db, "corretores", id), {
            nome: novoNome,
            telefone: novoTelefone,
            email: novoEmail
        });
        bootstrap.Modal.getInstance(document.getElementById('modal-editar-corretor')).hide();
        window.mostrarAlerta("Sucesso", "Dados do corretor atualizados!");
    } catch (error) {
        console.error(error);
        window.mostrarAlerta("Erro", "Ocorreu um erro ao salvar as alterações.");
    }
};

window.deletarCorretor = async (id, nome) => {
    window.mostrarConfirmacao("Excluir Permanentemente", `⚠️ Você está prestes a excluir o corretor <b>${nome}</b>.<br><br>Isso apagará ele do banco de dados definitivamente. Para manter o histórico dele, considere usar o botão de <b>Inativar</b> (⏸️) ao invés de excluir.<br><br>Tem certeza que deseja excluir?`, async () => {
        try { 
            await deleteDoc(doc(db, "corretores", id)); 
            window.mostrarAlerta("Excluído 🗑️", `O corretor ${nome} foi removido do sistema.`);
        } catch (error) { 
            console.error(error); 
            window.mostrarAlerta("Erro", "Erro de conexão ao tentar excluir."); 
        }
    }, 'btn-danger', '🗑️ Sim, Excluir Definitivamente');
};
