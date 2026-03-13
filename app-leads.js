import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, increment, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');
const inputBusca = document.getElementById('busca-leads');

const editSelectCorretor = document.getElementById('edit-select-corretor');
const editSelectFonte = document.getElementById('edit-fonte-lead');

const urlParams = new URLSearchParams(window.location.search);
const buscaDaUrl = urlParams.get('busca');

if (buscaDaUrl && inputBusca) { inputBusca.value = buscaDaUrl; }

let memoriaLeads = [];
window.telefoneCorretorAtual = ""; 

const STATUS_OPCOES = [
    { valor: "Distribuído", label: "🔵 Distribuído" },
    { valor: "Em negociação", label: "🟡 Em negociação" },
    { valor: "Declinado", label: "🟠 Declinado" },
    { valor: "Retornar depois", label: "🟣 Retornar depois" },
    { valor: "Proposta Gerada", label: "🐬 Proposta Gerada" },
    { valor: "Finalizado", label: "✅ Finalizado" },
    { valor: "Lead Inválido", label: "🔴 Lead Inválido" }
];

// ==========================================
// FUNÇÃO INTELIGENTE: ATUALIZA O PARCEIRO
// ==========================================
async function ajustarContadorParceiro(nomeFonte, tipoLead, valorParaSomar) {
    if (!nomeFonte || nomeFonte === "Outros") return; // Se for manual/outros, não faz nada
    try {
        const q = query(collection(db, "parceiros"), where("nome", "==", nomeFonte));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const parceiroId = snap.docs[0].id;
            const campo = (tipoLead === 'pme') ? 'distribuidos_pme' : 'distribuidos_pf';
            await updateDoc(doc(db, "parceiros", parceiroId), { [campo]: increment(valorParaSomar) });
        }
    } catch (e) { console.error("Erro ao integrar parceiro:", e); }
}

// ==========================================
// CARREGAR DADOS INICIAIS
// ==========================================
async function carregarCorretores() {
    onSnapshot(collection(db, "corretores"), (snapshot) => {
        let html = '<option value="">Selecione um corretor...</option>';
        snapshot.forEach(doc => {
            let d = doc.data();
            html += `<option value="${doc.id}" data-telefone="${d.telefone || ''}">${d.nome}</option>`;
        });
        selectCorretor.innerHTML = html;
        if(editSelectCorretor) editSelectCorretor.innerHTML = html; 
    });
}

async function carregarParceiros() {
    onSnapshot(collection(db, "parceiros"), (snapshot) => {
        let html = '<option value="">Selecione a fonte...</option>';
        if (snapshot.empty) html += '<option value="Outros">Nenhum parceiro</option>';
        else {
            snapshot.forEach(doc => { html += `<option value="${doc.data().nome}">${doc.data().nome}</option>`; });
            html += '<option value="Outros">Outros / Manual</option>';
        }
        selectFonte.innerHTML = html;
        if(editSelectFonte) editSelectFonte.innerHTML = html; 
    });
}

carregarCorretores();
carregarParceiros();

// ==========================================
// SALVAR NOVO LEAD
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeLead = document.getElementById('nome-lead').value;
    const telefone = document.getElementById('telefone-lead').value;
    const fonte = document.getElementById('fonte-lead').value;
    const tipo = document.getElementById('tipo-lead').value; 
    const dataChegada = document.getElementById('data-chegada').value;
    const dataEntrega = document.getElementById('data-entrega').value;
    const observacao = document.getElementById('obs-lead').value; 
    const statusInicial = document.getElementById('status-lead').value;
    
    const opCorretor = selectCorretor.options[selectCorretor.selectedIndex];
    const idCorretor = opCorretor.value;
    const nomeCorretor = opCorretor.text;
    const telefoneCorretor = opCorretor.getAttribute('data-telefone') || ''; 

    try {
        // 1. Salva o Lead
        await addDoc(collection(db, "leads"), {
            cliente: nomeLead, telefone: telefone, fonte: fonte, tipo: tipo, data_chegada: dataChegada,
            data_entrega: dataEntrega, observacao: observacao, status: statusInicial,
            corretor_id: idCorretor, corretor_nome: nomeCorretor, corretor_telefone: telefoneCorretor, 
            timestamp: new Date().toISOString(), data_status: new Date().toISOString() 
        });
        
        // 2. Integração: +1 Lead na aba de Produção
        const campoProducao = (tipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
        await updateDoc(doc(db, "corretores", idCorretor), { [campoProducao]: increment(1) });

        // 3. Integração: +1 Lead Distribuído na aba Parceiros
        await ajustarContadorParceiro(fonte, tipo, 1);

        const primeiroNome = nomeCorretor.split(' ')[0];
        const textoObs = observacao.trim() !== '' ? observacao : "Nenhuma observação";
        
        const mensagem = `Oi, ${primeiroNome}! 🍋😎\nChegou uma OPORTUNIDADE pra você!\n\nCliente na pista, venda na mira 🎯\nAgora é contigo transformar lead em contrato! 💰🔥\n\n*Dados:*\n*Cliente:* ${nomeLead}\n*Tel:* ${telefone}\n*Tipo:* ${tipo.toUpperCase()}\n*Observações:* ${textoObs}\n\nVai lá e arrebenta! 💥🍋🚀`;

        document.getElementById('texto-mensagem-copiar').value = mensagem;
        window.telefoneCorretorAtual = telefoneCorretor;

        bootstrap.Modal.getInstance(document.getElementById('modal-novo-lead'))?.hide();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-mensagem-lead')).show();

        form.reset();
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
        document.getElementById('status-lead').value = "Distribuído"; 
    } catch (error) { console.error(error); alert("Erro ao salvar."); }
});

// ==========================================
// RENDERIZAR TABELA DE LEADS
// ==========================================
function filtrarE_Renderizar() {
    if(!inputBusca) return; 
    const termo = inputBusca.value.toLowerCase().trim(); 
    const filtrados = memoriaLeads.filter(lead => {
        return `${lead.cliente || ''} ${lead.corretor_nome || ''} ${lead.fonte || ''} ${lead.status || ''} ${lead.tipo || ''} ${lead.observacao || ''}`.toLowerCase().includes(termo);
    });
    renderizarTabela(filtrados);
}

const q = query(collection(db, "leads"), orderBy("timestamp", "desc")); 
onSnapshot(q, (snapshot) => {
    memoriaLeads = []; 
    snapshot.forEach(doc => { memoriaLeads.push({ id: doc.id, ...doc.data() }); });
    filtrarE_Renderizar();
});

if(inputBusca) inputBusca.addEventListener('input', filtrarE_Renderizar);

function renderizarTabela(listaDeLeads) {
    let html = '';
    if (listaDeLeads.length === 0) {
        tabela.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Nenhum lead encontrado.</td></tr>'; return;
    }
    
    listaDeLeads.forEach(d => {
        let dataFmt = d.data_entrega ? d.data_entrega.split('-').reverse().slice(0,2).join('/') : "";
        let badgeTipo = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        let selectStatus = `<select class="form-select form-select-sm border-secondary fw-bold mx-auto" onchange="mudarStatus('${d.id}', this.value)" style="font-size: 0.85rem; max-width: 160px;">`;
        STATUS_OPCOES.forEach(opcao => {
            selectStatus += `<option value="${opcao.valor}" ${d.status === opcao.valor ? "selected" : ""}>${opcao.label}</option>`;
        });
        selectStatus += `</select>`;

        let partesNome = (d.corretor_nome || '').split(' ');
        let nomeExibicao = partesNome[0] + (partesNome.length > 1 ? ' ' + partesNome[1] : '');

        let btnObs = d.observacao && d.observacao.trim() !== '' 
            ? `<button onclick="abrirModalObs('${d.id}')" class="btn btn-sm btn-outline-secondary shadow-sm px-2" title="Ler">👁️ Ler</button>` 
            : '<span class="text-muted">-</span>';

        html += `
            <tr>
                <td class="text-start ps-3 align-middle text-nowrap">${dataFmt}</td>
                <td class="align-middle text-nowrap"><small class="fw-bold text-secondary">${d.fonte || '-'}</small></td>
                <td class="align-middle text-nowrap"><span class="fw-bold text-uppercase">${nomeExibicao}</span></td>
                <td class="align-middle"><span class="badge ${badgeTipo} px-2 py-1 shadow-sm border border-secondary">${(d.tipo || '').toUpperCase()}</span></td>
                <td class="text-start align-middle">
                    <div class="fw-bold text-wrap" style="min-width: 150px;">${d.cliente}</div>
                    <div class="small mt-1 text-muted text-nowrap">📞 ${d.telefone || 'Sem telefone'}</div>
                </td>
                <td class="align-middle">${btnObs}</td>
                <td class="align-middle">${selectStatus}</td>
                <td class="align-middle">
                    <div class="d-flex flex-nowrap justify-content-center gap-1">
                        <button onclick="abrirMensagemLead('${d.id}')" class="btn btn-sm btn-outline-success p-1 px-2 shadow-sm" title="Mensagem">💬</button>
                        <button onclick="abrirModalEditarLead('${d.id}')" class="btn btn-sm btn-outline-warning p-1 px-2 shadow-sm" title="Editar">✏️</button>
                        <button onclick="deletarLead('${d.id}')" class="btn btn-sm btn-outline-danger p-1 px-2 shadow-sm" title="Excluir">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
}

// ==========================================
// AÇÕES DO LEAD
// ==========================================
window.abrirMensagemLead = (idLead) => {
    const lead = memoriaLeads.find(l => l.id === idLead);
    if (!lead) return;
    const primeiroNome = (lead.corretor_nome || '').split(' ')[0];
    const textoObs = lead.observacao && lead.observacao.trim() !== '' ? lead.observacao : "Nenhuma observação";
    const mensagem = `Oi, ${primeiroNome}! 🍋😎\nChegou uma OPORTUNIDADE pra você!\n\nCliente na pista, venda na mira 🎯\nAgora é contigo transformar lead em contrato! 💰🔥\n\n*Dados:*\n*Cliente:* ${lead.cliente}\n*Tel:* ${lead.telefone}\n*Tipo:* ${(lead.tipo || '').toUpperCase()}\n*Observações:* ${textoObs}\n\nVai lá e arrebenta! 💥🍋🚀`;
    document.getElementById('texto-mensagem-copiar').value = mensagem;
    window.telefoneCorretorAtual = lead.corretor_telefone || '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-mensagem-lead')).show();
};

window.mudarStatus = async (id, novoStatus) => {
    try { await updateDoc(doc(db, "leads", id), { status: novoStatus, data_status: new Date().toISOString() }); } 
    catch (error) { console.error(error); }
};

window.deletarLead = async (id) => {
    if(confirm("Deseja excluir este lead? Todos os contadores serão atualizados automaticamente.")) {
        try { 
            const lead = memoriaLeads.find(l => l.id === id);
            if(lead) {
                // Retira do corretor
                if(lead.corretor_id) {
                    const cProd = (lead.tipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
                    await updateDoc(doc(db, "corretores", lead.corretor_id), { [cProd]: increment(-1) });
                }
                // Retira do Parceiro
                await ajustarContadorParceiro(lead.fonte, lead.tipo, -1);
            }
            await deleteDoc(doc(db, "leads", id)); 
        } catch (error) { console.error(error); }
    }
};

window.abrirModalEditarLead = (idLead) => {
    const lead = memoriaLeads.find(l => l.id === idLead);
    if (!lead) return;
    document.getElementById('edit-id-lead').value = lead.id;
    document.getElementById('edit-nome-lead').value = lead.cliente || '';
    document.getElementById('edit-telefone-lead').value = lead.telefone || '';
    document.getElementById('edit-tipo-lead').value = lead.tipo || 'pme';
    document.getElementById('edit-fonte-lead').value = lead.fonte || '';
    document.getElementById('edit-select-corretor').value = lead.corretor_id || '';
    document.getElementById('edit-obs-lead').value = lead.observacao || '';
    new bootstrap.Modal(document.getElementById('modal-editar-lead')).show();
};

window.salvarEdicaoLead = async () => {
    const idLead = document.getElementById('edit-id-lead').value;
    const novoNome = document.getElementById('edit-nome-lead').value.trim();
    const novoTelefone = document.getElementById('edit-telefone-lead').value.trim();
    const novoTipo = document.getElementById('edit-tipo-lead').value;
    const novaFonte = document.getElementById('edit-fonte-lead').value;
    const novaObs = document.getElementById('edit-obs-lead').value.trim();
    
    const comboCorretor = document.getElementById('edit-select-corretor');
    const novoIdCorretor = comboCorretor.value;
    const novoNomeCorretor = comboCorretor.options[comboCorretor.selectedIndex].text;
    const novoTelCorretor = comboCorretor.options[comboCorretor.selectedIndex].getAttribute('data-telefone') || '';

    if (!novoNome || !novoIdCorretor) return alert("Preencha o nome e o corretor.");

    try {
        const leadAntigo = memoriaLeads.find(l => l.id === idLead);
        
        if (leadAntigo) {
            // Se mudou o corretor ou o tipo (Ajuste aba Produção)
            if (leadAntigo.corretor_id !== novoIdCorretor || leadAntigo.tipo !== novoTipo) {
                if (leadAntigo.corretor_id) {
                    const campoAntigo = (leadAntigo.tipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
                    await updateDoc(doc(db, "corretores", leadAntigo.corretor_id), { [campoAntigo]: increment(-1) });
                }
                const campoNovo = (novoTipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
                await updateDoc(doc(db, "corretores", novoIdCorretor), { [campoNovo]: increment(1) });
            }

            // Se mudou a Fonte parceira ou o tipo (Ajuste aba Parceiros)
            if (leadAntigo.fonte !== novaFonte || leadAntigo.tipo !== novoTipo) {
                await ajustarContadorParceiro(leadAntigo.fonte, leadAntigo.tipo, -1);
                await ajustarContadorParceiro(novaFonte, novoTipo, 1);
            }
        }

        await updateDoc(doc(db, "leads", idLead), {
            cliente: novoNome, telefone: novoTelefone, tipo: novoTipo, fonte: novaFonte, observacao: novaObs,
            corretor_id: novoIdCorretor, corretor_nome: novoNomeCorretor, corretor_telefone: novoTelCorretor
        });

        bootstrap.Modal.getInstance(document.getElementById('modal-editar-lead')).hide();
    } catch (error) { console.error(error); alert("Erro ao editar."); }
};

window.abrirModalObs = (idLead) => {
    const lead = memoriaLeads.find(l => l.id === idLead);
    if (!lead) return;
    document.getElementById('texto-ver-obs').innerText = lead.observacao || 'Nenhuma observação.';
    new bootstrap.Modal(document.getElementById('modal-ver-obs')).show();
};

window.copiarMensagemLead = () => {
    const textarea = document.getElementById('texto-mensagem-copiar');
    textarea.select();
    textarea.setSelectionRange(0, 99999); 
    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.getElementById('btn-copiar-msg');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = "✅ Copiado!";
        btn.classList.replace('btn-outline-success', 'btn-dark'); 
        setTimeout(() => { btn.innerHTML = textoOriginal; btn.classList.replace('btn-dark', 'btn-outline-success'); }, 2000);
    });
};

window.enviarWhatsAppLead = () => {
    const textarea = document.getElementById('texto-mensagem-copiar');
    let tel = window.telefoneCorretorAtual.replace(/\D/g, ''); 
    let url = (tel && tel.length >= 10) 
        ? `https://wa.me/${tel.startsWith('55') ? tel : '55'+tel}?text=${encodeURIComponent(textarea.value)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(textarea.value)}`;
    window.open(url, '_blank');
};
