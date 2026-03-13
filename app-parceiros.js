import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, getDocs, where, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-parceiro');
const listaParceiros = document.getElementById('lista-parceiros');
const listaHistorico = document.getElementById('lista-historico');
const datalistEmpresas = document.getElementById('lista-empresas');

if(document.getElementById('data-compra')) {
    document.getElementById('data-compra').valueAsDate = new Date();
}

// ==========================================
// 1. CARREGAR TABELA DE PARCEIROS
// ==========================================
onSnapshot(collection(db, "parceiros"), (snapshot) => {
    let html = '';
    let options = '';
    
    if (snapshot.empty) {
        listaParceiros.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">Nenhum parceiro cadastrado.</td></tr>';
        return;
    }

    snapshot.forEach(docSnap => {
        const id = docSnap.id;
        const d = docSnap.data();
        options += `<option value="${d.nome}">`;

        let comprados = parseInt(d.comprados) || 0;
        let distPme = parseInt(d.distribuidos_pme) || 0;
        let distPf = parseInt(d.distribuidos_pf) || 0;
        let invalidos = parseInt(d.invalidos) || 0;
        
        // MATEMÁTICA DA TABELA
        let distTotal = distPme + distPf;
        let restam = (comprados - distTotal) + invalidos; 
        
        let corRestam = restam > 0 ? 'text-success' : (restam < 0 ? 'text-danger' : 'text-secondary');

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold text-uppercase">${d.nome}</td>
                <td class="fw-bold">${comprados}</td>
                <td class="text-info fw-bold">${distPme}</td>
                <td class="text-primary fw-bold">${distPf}</td>
                <td class="fw-bold text-dark">${distTotal}</td>
                <td class="fw-bold ${corRestam}">${restam}</td>
                <td class="fw-bold text-danger">${invalidos}</td>
                <td>
                    <button onclick="abrirModalEditarParceiro('${id}', '${d.nome}', ${comprados}, ${distPme}, ${distPf}, ${invalidos})" class="btn btn-sm btn-outline-warning p-1 px-2 shadow-sm me-1" title="Editar">✏️</button>
                    <button onclick="deletarParceiro('${id}')" class="btn btn-sm btn-outline-danger p-1 px-2 shadow-sm" title="Excluir Parceiro">🗑️</button>
                </td>
            </tr>
        `;
    });
    
    listaParceiros.innerHTML = html;
    if(datalistEmpresas) datalistEmpresas.innerHTML = options;
});

// ==========================================
// 2. SALVAR NOVA COMPRA
// ==========================================
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('nome-parceiro').value.trim().toUpperCase();
        const data = document.getElementById('data-compra').value;
        const qtd = parseInt(document.getElementById('qtd-leads').value) || 0;

        if (!nome || qtd <= 0) return alert("Preencha o nome e uma quantidade maior que zero.");

        try {
            // 1. Salva no histórico
            let dataFormatada = data.split('-').reverse().join('/');
            await addDoc(collection(db, "historico_compras"), {
                empresa: nome, data: data, data_formatada: dataFormatada, qtd: qtd, timestamp: new Date().toISOString()
            });

            // 2. Procura se o parceiro já existe para somar
            const q = query(collection(db, "parceiros"), where("nome", "==", nome));
            const snap = await getDocs(q);

            if (!snap.empty) {
                await updateDoc(doc(db, "parceiros", snap.docs[0].id), { comprados: increment(qtd) });
            } else {
                await addDoc(collection(db, "parceiros"), {
                    nome: nome, comprados: qtd, distribuidos_pme: 0, distribuidos_pf: 0, invalidos: 0
                });
            }

            form.reset();
            document.getElementById('data-compra').valueAsDate = new Date();
            alert("✅ Compra registrada com sucesso!");
        } catch (error) { console.error(error); alert("Erro ao salvar."); }
    });
}

// ==========================================
// 3. EDIÇÃO MANUAL (MODAL) E EXCLUSÃO
// ==========================================
window.abrirModalEditarParceiro = (id, nome, comp, dpme, dpf, inv) => {
    document.getElementById('edit-parceiro-id').value = id;
    document.getElementById('edit-parceiro-nome').innerText = nome;
    document.getElementById('edit-parceiro-comprados').value = comp;
    document.getElementById('edit-parceiro-pme').value = dpme;
    document.getElementById('edit-parceiro-pf').value = dpf;
    document.getElementById('edit-parceiro-invalidos').value = inv;
    new bootstrap.Modal(document.getElementById('modal-editar-parceiro')).show();
};

window.salvarEdicaoParceiro = async () => {
    const id = document.getElementById('edit-parceiro-id').value;
    const comp = parseInt(document.getElementById('edit-parceiro-comprados').value) || 0;
    const dpme = parseInt(document.getElementById('edit-parceiro-pme').value) || 0;
    const dpf = parseInt(document.getElementById('edit-parceiro-pf').value) || 0;
    const inv = parseInt(document.getElementById('edit-parceiro-invalidos').value) || 0;

    try {
        await updateDoc(doc(db, "parceiros", id), {
            comprados: comp, distribuidos_pme: dpme, distribuidos_pf: dpf, invalidos: inv
        });
        bootstrap.Modal.getInstance(document.getElementById('modal-editar-parceiro')).hide();
    } catch(e) { console.error(e); alert("Erro ao salvar."); }
};

window.deletarParceiro = async (id) => {
    if(confirm("⚠️ ATENÇÃO: Deseja realmente excluir este parceiro?\nIsso não apagará os leads que já foram distribuídos, mas apagará a empresa da lista.")) {
        try { await deleteDoc(doc(db, "parceiros", id)); } 
        catch (e) { console.error(e); alert("Erro ao excluir."); }
    }
};

// ==========================================
// 4. CARREGAR E ZERAR HISTÓRICO
// ==========================================
const qHist = query(collection(db, "historico_compras"), orderBy("timestamp", "desc"));
onSnapshot(qHist, (snapshot) => {
    let html = '';
    if (snapshot.empty) {
        if(listaHistorico) listaHistorico.innerHTML = '<li class="list-group-item text-center text-muted py-4">Nenhum histórico.</li>';
        return;
    }
    snapshot.forEach(doc => {
        let d = doc.data();
        let diaMes = d.data_formatada ? d.data_formatada.substring(0,5) : '';
        html += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <span class="badge bg-secondary me-2">${diaMes}</span>
                    <span class="fw-bold text-dark" style="font-size: 0.85rem;">${d.empresa}</span>
                </div>
                <span class="badge bg-success rounded-pill">+ ${d.qtd} leads</span>
            </li>
        `;
    });
    if(listaHistorico) listaHistorico.innerHTML = html;
});

window.limparHistoricoCompras = async () => {
    if(confirm("Tem certeza que deseja APAGAR TODO o histórico de compras? Os totais da tabela não serão alterados.")) {
        try {
            const snap = await getDocs(collection(db, "historico_compras"));
            snap.forEach(d => { deleteDoc(doc(db, "historico_compras", d.id)); });
        } catch (e) { console.error(e); }
    }
};
