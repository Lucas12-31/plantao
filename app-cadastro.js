import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-corretor');
const lista = document.getElementById('lista-corretores');

// ==========================================
// 1. CADASTRAR NOVO CORRETOR
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome-corretor').value.trim();
    const telefone = document.getElementById('telefone-corretor').value.trim();

    try {
        await addDoc(collection(db, "corretores"), {
            nome: nome,
            telefone: telefone,
            producao_pme: 0,
            producao_pf: 0,
            saldo_pme: 0,
            saldo_pf: 0,
            data_cadastro: new Date().toISOString()
        });

        alert("✅ Corretor cadastrado com sucesso!");
        form.reset();
        document.getElementById('nome-corretor').focus();
    } catch (error) {
        console.error("Erro ao cadastrar corretor:", error);
        alert("Erro ao cadastrar.");
    }
});

// ==========================================
// 2. LISTAR EQUIPE EM TEMPO REAL
// ==========================================
const q = query(collection(db, "corretores"), orderBy("nome", "asc"));

onSnapshot(q, (snapshot) => {
    let html = '';
    
    if (snapshot.empty) {
        lista.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">Nenhum corretor cadastrado.</td></tr>';
        return;
    }

    snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const dados = docSnap.data();
        const telefone = dados.telefone || '';
        
        // Formatação visual se não tiver telefone
        const telBadge = telefone 
            ? `<span class="fw-bold text-secondary">${telefone}</span>` 
            : `<span class="badge bg-light text-muted border">Sem número</span>`;

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold text-uppercase text-dark">${dados.nome}</td>
                <td class="align-middle">${telBadge}</td>
                <td class="align-middle">
                    <button onclick="abrirModalEditarCorretor('${id}', '${dados.nome}', '${telefone}')" class="btn btn-outline-warning btn-sm me-1 fw-bold shadow-sm" title="Editar Corretor">
                        ✏️ Editar
                    </button>
                    <button onclick="deletarCorretor('${id}')" class="btn btn-outline-danger btn-sm fw-bold shadow-sm" title="Excluir Corretor">
                        🗑️ Excluir
                    </button>
                </td>
            </tr>
        `;
    });

    lista.innerHTML = html;
});

// ==========================================
// 3. EDITAR CORRETOR (MODAL)
// ==========================================
window.abrirModalEditarCorretor = (id, nome, telefone) => {
    // Preenche os campos do modal
    document.getElementById('edit-id-corretor').value = id;
    document.getElementById('edit-nome-corretor').value = nome;
    document.getElementById('edit-telefone-corretor').value = telefone;

    // Abre o Modal
    const modal = new bootstrap.Modal(document.getElementById('modal-editar-corretor'));
    modal.show();
};

window.salvarEdicaoCorretor = async () => {
    const id = document.getElementById('edit-id-corretor').value;
    const novoNome = document.getElementById('edit-nome-corretor').value.trim();
    const novoTelefone = document.getElementById('edit-telefone-corretor').value.trim();

    if (!novoNome) return alert("O nome do corretor não pode ficar em branco.");

    try {
        const corretorRef = doc(db, "corretores", id);
        
        // Atualiza APENAS o nome e o telefone (preservando produção e leads)
        await updateDoc(corretorRef, {
            nome: novoNome,
            telefone: novoTelefone
        });

        // Fecha o Modal
        bootstrap.Modal.getInstance(document.getElementById('modal-editar-corretor')).hide();
        
    } catch (error) {
        console.error("Erro ao atualizar corretor:", error);
        alert("Erro ao salvar as alterações.");
    }
};

// ==========================================
// 4. EXCLUIR CORRETOR
// ==========================================
window.deletarCorretor = async (id) => {
    if(confirm("⚠️ ATENÇÃO: Tem certeza que deseja excluir este corretor?\nIsso apagará a produção e os saldos de leads atrelados a ele.")) {
        try {
            await deleteDoc(doc(db, "corretores", id));
        } catch (error) {
            console.error("Erro ao excluir corretor:", error);
            alert("Erro ao excluir.");
        }
    }
};
