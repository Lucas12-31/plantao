import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, getDocs, query, where, increment, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-parceiro');
const lista = document.getElementById('lista-parceiros');
const listaHistorico = document.getElementById('lista-historico');
const datalistEmpresas = document.getElementById('lista-empresas');

if(document.getElementById('data-compra')) {
    document.getElementById('data-compra').valueAsDate = new Date();
}

// ==========================================
// 1. SALVAR NOVA COMPRA
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome-parceiro').value.trim();
    const dataCompra = document.getElementById('data-compra').value;
    const qtd = parseInt(document.getElementById('qtd-leads').value);

    try {
        await addDoc(collection(db, "historico_compras"), {
            parceiro: nome,
            data_compra: dataCompra,
            qtd_comprada: qtd,
            timestamp: new Date().toISOString()
        });

        const q = query(collection(db, "parceiros"), where("nome", "==", nome));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            await updateDoc(doc(db, "parceiros", docId), {
                leads_comprados: increment(qtd)
            });
        } else {
            await addDoc(collection(db, "parceiros"), {
                nome: nome,
                leads_comprados: qtd,
                data_cadastro: new Date().toISOString()
            });
        }

        alert("Compra registrada e estoque atualizado com sucesso!");
        form.reset();
        document.getElementById('data-compra').valueAsDate = new Date();
    } catch (error) {
        console.error("Erro ao salvar compra:", error);
        alert("Erro ao salvar.");
    }
});

// ==========================================
// 2. LÓGICA DE ESTOQUE (TEMPO REAL)
// ==========================================
let estadoParceiros = [];
let estadoLeads = [];

// Fica "ouvindo" os parceiros
onSnapshot(collection(db, "parceiros"), (snap) => {
    estadoParceiros = [];
    snap.forEach(d => estadoParceiros.push({ id: d.id, ...d.data() }));
    atualizarTabelaEstoque();
});

// Fica "ouvindo" os leads (Para calcular Distribuídos e Inválidos em tempo real)
onSnapshot(collection(db, "leads"), (snap) => {
    estadoLeads = [];
    snap.forEach(d => estadoLeads.push(d.data()));
    atualizarTabelaEstoque();
});

function atualizarTabelaEstoque() {
    let html = '';
    let datalistHtml = '';
    
    if (estadoParceiros.length === 0) {
        lista.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Nenhum parceiro cadastrado.</td></tr>';
        datalistEmpresas.innerHTML = '';
        return;
    }

    estadoParceiros.forEach(p => {
        const nomeParceiro = p.nome;
        const id = p.id;
        const comprados = parseInt(p.leads_comprados) || 0;

        datalistHtml += `<option value="${nomeParceiro}">`;

        // Lógica de Filtro para este Parceiro Específico
        const leadsDestaFonte = estadoLeads.filter(l => l.fonte === nomeParceiro);
        const distribuidosTotal = leadsDestaFonte.length;
        const invalidos = leadsDestaFonte.filter(l => l.status === 'Lead Inválido').length;

        // Calcula o Saldo
        const consumoReal = distribuidosTotal - invalidos;
        const faltam = comprados - consumoReal;

        // Cores de alerta
        let classeSaldo = "text-success fw-bold";
        if (faltam <= 0) classeSaldo = "text-danger fw-bold";
        else if (faltam < (comprados * 0.1)) classeSaldo = "text-warning fw-bold";

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold text-uppercase">${nomeParceiro}</td>
                <td class="fs-5">${comprados}</td>
                <td class="fs-5">${distribuidosTotal}</td>
                <td class="${classeSaldo} fs-5">${faltam}</td>
                <td><span class="badge bg-danger rounded-pill fs-6 px-3 py-2">${invalidos}</span></td>
                <td>
                    <button onclick="editar('${id}', '${comprados}')" class="btn btn-outline-warning btn-sm me-1" title="Editar Comprados (Manual)">
                        ✏️ Editar
                    </button>
                    <button onclick="deletar('${id}')" class="btn btn-outline-danger btn-sm" title="Excluir Empresa">
                        🗑️ Excluir
                    </button>
                </td>
            </tr>
        `;
    });

    lista.innerHTML = html;
    datalistEmpresas.innerHTML = datalistHtml;
}

// ==========================================
// 3. LISTAR HISTÓRICO MENSAL (ESQUERDA)
// ==========================================
const qHist = query(collection(db, "historico_compras"), orderBy("data_compra", "desc"));

onSnapshot(qHist, (snapshot) => {
    if (snapshot.empty) {
        listaHistorico.innerHTML = '<li class="list-group-item text-center text-muted small py-3">Nenhuma compra registrada ainda.</li>';
        return;
    }

    const mesesNome = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    let agrupadoPorMes = {};

    snapshot.forEach(doc => {
        const dados = doc.data();
        const [ano, mes, dia] = dados.data_compra.split('-');
        const chaveMes = `${mesesNome[parseInt(mes) - 1]} ${ano}`;

        if (!agrupadoPorMes[chaveMes]) agrupadoPorMes[chaveMes] = [];
        agrupadoPorMes[chaveMes].push({ ...dados, dia });
    });

    let html = '';
    for (const [mesAno, compras] of Object.entries(agrupadoPorMes)) {
        html += `<li class="list-group-item bg-light fw-bold text-secondary text-uppercase border-bottom-0" style="font-size: 0.8rem;">
                    📆 ${mesAno}
                 </li>`;
        
        compras.forEach(c => {
            html += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <span class="badge bg-secondary me-2">${c.dia}</span>
                        <span class="fw-bold text-dark">${c.parceiro}</span>
                    </div>
                    <span class="badge bg-success rounded-pill px-2 py-1">+ ${c.qtd_comprada} leads</span>
                </li>
            `;
        });
    }

    listaHistorico.innerHTML = html;
});

// ==========================================
// FUNÇÕES DE EDIÇÃO E EXCLUSÃO
// ==========================================
window.editar = async (id, valorAtual) => {
    let novoValor = prompt(`Alterar a quantidade de leads COMPRADOS:`, valorAtual);
    if (novoValor === null || novoValor.trim() === "") return;

    novoValor = parseInt(novoValor);
    if (isNaN(novoValor)) return alert("Por favor, digite um número válido!");

    try {
        await updateDoc(doc(db, "parceiros", id), {
            leads_comprados: novoValor
        });
    } catch (error) {
        console.error(error);
        alert("Erro ao atualizar o valor.");
    }
};

window.deletar = async (id) => {
    if(confirm("Tem certeza que deseja excluir esta empresa da carteira?\nIsso não apagará o histórico de compras já feitas.")) {
        await deleteDoc(doc(db, "parceiros", id));
    }
};
