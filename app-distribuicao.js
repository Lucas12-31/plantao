import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.executarLogica = async () => {
    
    // 1. Pegar inputs da tela (Quantos leads temos para dar?)
    let totalPME = parseInt(document.getElementById('leads-pme-total').value) || 0;
    let totalPF = parseInt(document.getElementById('leads-pf-total').value) || 0;
    
    // 2. Pegar corretores do Firebase
    const querySnapshot = await getDocs(collection(db, "corretores"));
    let corretores = [];
    
    querySnapshot.forEach((doc) => {
        let dados = doc.data();
        
        // --- CORREÇÃO AQUI ---
        // Somamos PME + PF para saber a produção total do mês
        let prodPME = parseFloat(dados.producao_pme) || 0;
        let prodPF = parseFloat(dados.producao_pf) || 0;
        let totalGeral = prodPME + prodPF;

        corretores.push({ 
            id: doc.id, 
            ...dados,
            totalGeral: totalGeral // Criamos esse campo calculado
        });
    });

    // 3. FILTRAR ELEGÍVEIS (Quem bateu a meta de R$ 3.000 no total?)
    // Agora usamos o totalGeral, não mais "producao"
    let elegiveis = corretores.filter(c => c.totalGeral >= 3000);
    
    // Se ninguém bateu a meta, avisa e para.
    if (elegiveis.length === 0) {
        alert("Nenhum corretor atingiu a meta mínima de R$ 3.000 ainda.");
        renderizarTabela([], corretores); // Mostra todos como inaptos
        return;
    }

    // Inicializa contadores temporários para distribuição
    elegiveis.forEach(c => {
        c.temp_leadsPME = 0;
        c.temp_leadsPF = 0;
        c.temp_motivo = "";
    });

    // --- FASE 1: PROGRESSÃO DE META (Bônus por mérito) ---
    // Regra: A cada 2k acima dos 3k iniciais = ganha 1 PME
    elegiveis.forEach(c => {
        let excedente = c.totalGeral - 3000;
        
        if (excedente >= 2000) {
            let bonusPME = Math.floor(excedente / 2000); // Ex: 4000 de excedente = 2 leads
            
            // Verifica se tem estoque de leads PME para pagar o bônus
            if (totalPME >= bonusPME) {
                c.temp_leadsPME += bonusPME;
                totalPME -= bonusPME; // Remove do estoque
                if(bonusPME > 0) c.temp_motivo += `🎯 Ganhou ${bonusPME} PME por supermeta. `;
            } else if (totalPME > 0) {
                // Se o estoque for menor que o bônus, dá o que tem
                c.temp_leadsPME += totalPME;
                c.temp_motivo += `⚠️ Ganhou ${totalPME} PME (estoque acabou). `;
                totalPME = 0;
            }
        }
    });

    // --- FASE 2: PESO 2 (PME ATIVO) ---
    // Distribui o RESTANTE dos leads PME para quem tem PME Ativo
    let corretoresPMEAtivo = elegiveis.filter(c => c.pme_ativo);
    
    if (corretoresPMEAtivo.length > 0 && totalPME > 0) {
        let pmePorCabeca = Math.floor(totalPME / corretoresPMEAtivo.length);
        
        // Se a divisão der zero (ex: 1 lead para 3 pessoas), sobra tudo para gestão
        if (pmePorCabeca > 0) {
            corretoresPMEAtivo.forEach(c => {
                c.temp_leadsPME += pmePorCabeca;
                c.temp_motivo += `⭐ +${pmePorCabeca} por PME Ativo. `;
            });
            totalPME -= (pmePorCabeca * corretoresPMEAtivo.length);
        }
    }

    // --- FASE 3: DISTRIBUIÇÃO PF (Igualitária para quem bateu meta) ---
    if (elegiveis.length > 0 && totalPF > 0) {
        let pfPorCabeca = Math.floor(totalPF / elegiveis.length);
        
        if (pfPorCabeca > 0) {
            elegiveis.forEach(c => {
                c.temp_leadsPF += pfPorCabeca;
            });
            totalPF -= (pfPorCabeca * elegiveis.length);
        }
    }

    // Renderiza o resultado final
    renderizarTabela(elegiveis, corretores);
    mostrarSobras(totalPME, totalPF);
};

// Função auxiliar de desenho da tabela
function renderizarTabela(elegiveis, todosCorretores) {
    const tbody = document.getElementById('tabela-resultado');
    tbody.innerHTML = '';
    
    // Lista de IDs dos elegíveis para não duplicar
    const idsElegiveis = elegiveis.map(c => c.id);

    // 1. Mostrar os Aprovados (Verdes/Amarelos)
    elegiveis.forEach(c => {
        let destaque = c.pme_ativo ? "table-warning" : "table-success"; // Amarelo se for PME Ativo
        let icone = c.pme_ativo ? "⭐" : "";
        
        tbody.innerHTML += `
            <tr class="${destaque}">
                <td>${c.nome} ${icone}</td>
                <td><span class="badge bg-success">Apto</span></td>
                <td>R$ ${c.totalGeral.toLocaleString('pt-BR')}</td>
                <td class="fw-bold fs-5">${c.temp_leadsPME} <br><small class="text-muted fw-normal fs-6">${c.temp_motivo}</small></td>
                <td class="fw-bold fs-5">${c.temp_leadsPF}</td>
            </tr>
        `;
    });

    // 2. Mostrar os Reprovados (Cinza)
    todosCorretores.forEach(c => {
        if (!idsElegiveis.includes(c.id)) {
            tbody.innerHTML += `
                <tr class="table-light text-muted opacity-75">
                    <td>${c.nome}</td>
                    <td><span class="badge bg-danger">Inapto (< 3k)</span></td>
                    <td>R$ ${c.totalGeral.toLocaleString('pt-BR')}</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            `;
        }
    });
}

function mostrarSobras(pme, pf) {
    const divSobras = document.getElementById('alert-sobras');
    if (pme > 0 || pf > 0) {
        divSobras.classList.remove('d-none');
        divSobras.innerHTML = `
            <strong>🚨 SOBRAS (GESTÃO):</strong> 
            Ficaram <b>${pme} Leads PME</b> e <b>${pf} Leads PF</b> sem dono. 
            <br>A supervisora deve distribuir manualmente.
        `;
    } else {
        divSobras.classList.add('d-none');
    }
}
