import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- PARTE 1: MONITORAMENTO DE ESTOQUE (NOVO) ---
// Roda automaticamente assim que abre a página para preencher a tabelinha lateral
async function carregarEstoqueParceiros() {
    const tabelaEstoque = document.getElementById('tabela-estoque-parceiros');

    // Escuta em tempo real para atualizar os números se alguém cadastrar lead
    onSnapshot(collection(db, "parceiros"), async (snapParceiros) => {
        // Precisamos buscar os leads para contar
        const snapLeads = await getDocs(collection(db, "leads"));
        const leads = [];
        snapLeads.forEach(l => leads.push(l.data()));

        let html = '';

        snapParceiros.forEach(doc => {
            const p = doc.data();
            const nomeParceiro = p.nome;
            const comprados = parseInt(p.leads_comprados) || 0;

            // CONTA MÁGICA: Filtra quantos leads têm essa fonte
            const distribuidos = leads.filter(l => l.fonte === nomeParceiro).length;
            const faltam = comprados - distribuidos;

            // Cor de alerta se estiver acabando (menos de 10%)
            let classeSaldo = "text-success fw-bold";
            if (faltam <= 0) classeSaldo = "text-danger fw-bold";
            else if (faltam < (comprados * 0.1)) classeSaldo = "text-warning fw-bold";

            html += `
                <tr>
                    <td class="text-start ps-3 fw-bold text-truncate" style="max-width: 100px;" title="${nomeParceiro}">
                        ${nomeParceiro}
                    </td>
                    <td>${comprados}</td>
                    <td>${distribuidos}</td>
                    <td class="${classeSaldo}">${faltam}</td>
                </tr>
            `;
        });

        if (html === '') html = '<tr><td colspan="4">Nenhum parceiro.</td></tr>';
        
        // Verifica se o elemento existe antes de escrever (evita erro em outras páginas)
        if(tabelaEstoque) tabelaEstoque.innerHTML = html;
    });
}

// Inicia o monitoramento
carregarEstoqueParceiros();


// --- PARTE 2: LÓGICA DE DISTRIBUIÇÃO (Mantida Original) ---
let resultadoParaSalvar = [];

window.executarLogica = async () => {
    let totalPME = parseInt(document.getElementById('leads-pme-total').value) || 0;
    let totalPF = parseInt(document.getElementById('leads-pf-total').value) || 0;
    
    const querySnapshot = await getDocs(collection(db, "corretores"));
    let corretores = [];
    
    querySnapshot.forEach((doc) => {
        let dados = doc.data();
        let prodPME = parseFloat(dados.producao_pme) || 0;
        let prodPF = parseFloat(dados.producao_pf) || 0;
        let totalFinanceiro = prodPME + prodPF; 
        let totalPontos = (prodPME * 2) + prodPF;
        let isPmeAtivo = prodPME > 0;

        corretores.push({ 
            id: doc.id, ...dados,
            totalFinanceiro, totalPontos, isPmeAtivo,
            temp_leadsPME: 0, temp_leadsPF: 0, temp_motivo: ""
        });
    });

    let elegiveis = corretores.filter(c => c.totalFinanceiro >= 3000);
    elegiveis.sort((a, b) => b.totalPontos - a.totalPontos);

    if (elegiveis.length === 0) {
        alert("Nenhum corretor atingiu a meta mínima de R$ 3.000.");
        renderizarTabela([], corretores);
        return;
    }

    // Zera contadores
    elegiveis.forEach(c => { c.temp_leadsPME = 0; c.temp_leadsPF = 0; c.temp_motivo = ""; });

    // 1. Bônus Progressivo
    elegiveis.forEach(c => {
        let excedente = c.totalFinanceiro - 3000;
        if (excedente >= 2000) {
            let bonusPME = Math.floor(excedente / 2000);
            if (totalPME >= bonusPME) {
                c.temp_leadsPME += bonusPME; totalPME -= bonusPME;
                if(bonusPME > 0) c.temp_motivo += `🎯 +${bonusPME} (Meta). `;
            } else if (totalPME > 0) {
                c.temp_leadsPME += totalPME; totalPME = 0;
            }
        }
    });

    // 2. Peso 2 (PME Ativo)
    let corretoresPME = elegiveis.filter(c => c.isPmeAtivo);
    if (corretoresPME.length > 0 && totalPME > 0) {
        let pmePorCabeca = Math.floor(totalPME / corretoresPME.length);
        if (pmePorCabeca > 0) {
            corretoresPME.forEach(c => {
                c.temp_leadsPME += pmePorCabeca;
                c.temp_motivo += `⭐ +${pmePorCabeca} (Peso 2). `;
            });
            totalPME -= (pmePorCabeca * corretoresPME.length);
        }
    }

    // 3. Distribuição PF Proporcional
    if (elegiveis.length > 0 && totalPF > 0) {
        let somaPontosGeral = elegiveis.reduce((acc, curr) => acc + curr.totalPontos, 0);
        let leadsPfParaDistribuir = totalPF;
        
        if (somaPontosGeral > 0) {
            elegiveis.forEach(c => {
                let share = c.totalPontos / somaPontosGeral;
                let leadsDoCorretor = Math.floor(leadsPfParaDistribuir * share);
                c.temp_leadsPF += leadsDoCorretor;
                totalPF -= leadsDoCorretor;
            });
        } else {
            let divisao = Math.floor(totalPF / elegiveis.length);
            elegiveis.forEach(c => { c.temp_leadsPF += divisao; totalPF -= divisao; });
        }
    }

    resultadoParaSalvar = elegiveis;
    renderizarTabela(elegiveis, corretores);
    document.getElementById('btn-salvar-db').classList.remove('d-none');
    mostrarSobras(totalPME, totalPF);
};

window.salvarNoBanco = async () => {
    if (resultadoParaSalvar.length === 0) return alert("Rode a distribuição primeiro!");
    let btn = document.getElementById('btn-salvar-db');
    btn.innerHTML = "Salvando...";
    btn.disabled = true;

    try {
        for (const c of resultadoParaSalvar) {
            const docRef = doc(db, "corretores", c.id);
            await updateDoc(docRef, {
                saldo_pme: c.temp_leadsPME,
                saldo_pf: c.temp_leadsPF,
                leads_entregues_pme: 0,
                leads_entregues_pf: 0
            });
        }
        alert("✅ Distribuição salva com sucesso!");
        window.location.href = "plantao.html";
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
        btn.innerHTML = "💾 Confirmar e Salvar";
        btn.disabled = false;
    }
};

function renderizarTabela(elegiveis, todos) {
    const tbody = document.getElementById('tabela-resultado');
    tbody.innerHTML = '';
    const idsElegiveis = elegiveis.map(c => c.id);
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtPontos = v => Math.floor(v).toLocaleString('pt-BR');

    elegiveis.forEach(c => {
        let destaque = c.isPmeAtivo ? "table-warning" : "table-success";
        let icone = c.isPmeAtivo ? "⭐" : "";
        tbody.innerHTML += `
            <tr class="${destaque}">
                <td>${c.nome} ${icone}</td>
                <td><span class="badge bg-success">Apto</span></td>
                <td>
                    <div class="fw-bold">${fmtMoney(c.totalFinanceiro)}</div>
                    <small class="text-muted" style="font-size: 0.8em">(${fmtPontos(c.totalPontos)} pts)</small>
                </td>
                <td class="fw-bold fs-5">${c.temp_leadsPME} <br><small class="text-muted fw-normal fs-6">${c.temp_motivo}</small></td>
                <td class="fw-bold fs-5">${c.temp_leadsPF}</td>
            </tr>`;
    });

    todos.forEach(c => {
        if (!idsElegiveis.includes(c.id)) {
            tbody.innerHTML += `
                <tr class="table-light text-muted opacity-75">
                    <td>${c.nome}</td>
                    <td><span class="badge bg-danger">Inapto</span></td>
                    <td>${fmtMoney(c.totalFinanceiro)}</td>
                    <td>-</td><td>-</td>
                </tr>`;
        }
    });
}

function mostrarSobras(pme, pf) {
    const div = document.getElementById('alert-sobras');
    if (pme > 0 || pf > 0) {
        div.classList.remove('d-none');
        div.innerHTML = `<strong>🚨 SOBRAS (GESTÃO):</strong> PME: ${pme} | PF: ${pf}`;
    } else {
        div.classList.add('d-none');
    }
}
