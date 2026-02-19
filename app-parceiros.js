import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, getDocs, query, where, increment, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-parceiro');
const lista = document.getElementById('lista-parceiros');
const listaHistorico = document.getElementById('lista-historico');
const datalistEmpresas = document.getElementById('lista-empresas');

// Preenche a data de hoje automaticamente no formulário
document.getElementById('data-compra').valueAsDate = new Date();

// ==========================================
// 1. SALVAR NOVA COMPRA
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome-parceiro').value.trim();
    const dataCompra = document.getElementById('data-compra').value;
    const qtd = parseInt(document.getElementById('qtd-leads').value);

    try {
        // Passo A: Gravar a transação no Histórico de Compras
        await addDoc(collection(db, "historico_compras"), {
            parceiro: nome,
            data_compra: dataCompra,
            qtd_comprada: qtd,
            timestamp: new Date().toISOString()
        });

        // Passo B: Atualizar a Carteira Principal (Estoque)
        const q = query(collection(db, "parceiros"), where("nome", "==", nome));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // Empresa já existe: Apenas incrementa os leads no saldo dela
            const docId = snapshot.docs[0].id;
            await updateDoc(doc(db, "parceiros", docId), {
                leads_comprados: increment(qtd)
            });
        } else {
            // Empresa nova: Cria o registro na carteira
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
// 2. LISTAR CARTEIRA ATUAL (DIREITA)
// ==========================================
onSnapshot(collection(db, "parceiros"), (snapshot) => {
    let html = '';
    let datalistHtml = '';
    
    if (snapshot.empty) {
        lista.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum parceiro cadastrado.</td></tr>';
        datalistEmpresas.innerHTML = '';
        return;
    }

    snapshot.forEach(d => {
        let dados = d.data();
        let id = d.id;

        // Alimenta as sugestões de digitação do formulário
        datalistHtml += `<option value="${dados.nome}">`;

        // Monta a Tabela
        html += `
            <tr>
                <td class="fw-bold">${dados.nome}</td>
                <td><span class="badge bg-primary fs-6">${dados.leads_comprados}</span></td>
                <td>
                    <button onclick="editar('${id}', '${dados.leads_comprados}')" class="btn btn-outline-warning btn-sm me-2" title="Editar Saldo">
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
    datalistEmpresas.innerHTML = datalistHtml; // Atualiza sugestões
});

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

    // Agrupa os documentos por Mês/Ano (Ex: Fevereiro 2026)
    snapshot.forEach(doc => {
        const dados = doc.data();
        const [ano, mes, dia] = dados.data_compra.split('-');
        const chaveMes = `${mesesNome[parseInt(mes) - 1]} ${ano}`;

        if (!agrupadoPorMes[chaveMes]) {
            agrupadoPorMes[chaveMes] = [];
        }
        agrupadoPorMes[chaveMes].push({ ...dados, dia });
    });

    // Monta o HTML separado por meses
    let html = '';
    for (const [mesAno, compras] of Object.entries(agrupadoPorMes)) {
        
        // Cabeçalho do Mês
        html += `<li class="list-group-item bg-light fw-bold text-secondary text-uppercase border-bottom-0" style="font-size: 0.8rem;">
                    📆 ${mesAno}
                 </li>`;
        
        // Lista de Compras do Mês
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
    let novoValor = prompt(`Alterar saldo ATUAL de leads na carteira:`, valorAtual);
    if (novoValor === null || novoValor.trim() === "") return;

    novoValor = parseInt(novoValor);
    if (isNaN(novoValor)) return alert("Por favor, digite um número válido!");

    try {
        await updateDoc(doc(db, "parceiros", id), {
            leads_comprados: novoValor
        });
        // Obs: Editar o saldo aqui NÃO altera o histórico de compras, serve apenas para ajuste de estoque.
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
