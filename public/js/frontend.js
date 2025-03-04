async function purchaseCode(campaignId) {
    const authCheck = await fetch('/auth-status', { credentials: 'include' });
    const authData = await authCheck.json();

    if (!authData.loggedIn) {
        showToast('Please log in to purchase', 'error');
        window.location.href = '/login';
        return;
    }

    window.location.href = `/order/${campaignId}`;
}

async function checkPaymentStatus(transactionId) {
    const interval = setInterval(async () => {
        const response = await fetch(`/api/check-payment/${transactionId}`);
        const result = await response.json();

        if (result.status === 'completed') {
            clearInterval(interval);
            showToast(`Payment successful! Your code: ${result.code}`, 'success');
            window.location.href = '/panel';
        }
    }, 30000);
}

// Fetch and store all campaigns
let allCampaigns = [];

fetch('/api/campaigns')
    .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
    })
    .then(campaigns => {
        allCampaigns = campaigns;
        const campaignsDiv = document.getElementById('campaigns');
        if (!campaigns.length) {
            campaignsDiv.innerHTML = '<p class="text-center text-gray-400 col-span-full">No campaigns available yet.</p>';
            return;
        }
        renderCampaigns(allCampaigns);

        // Add search filter
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredCampaigns = allCampaigns.filter(campaign =>
                campaign.name.toLowerCase().includes(searchTerm) ||
                campaign.commodity.toLowerCase().includes(searchTerm)
            );
            renderCampaigns(filteredCampaigns);
        });
    })
    .catch(err => console.error('Fetch error:', err));

function renderCampaigns(campaigns) {
    const campaignsDiv = document.getElementById('campaigns');
    campaignsDiv.innerHTML = '';
    if (!campaigns.length) {
        campaignsDiv.innerHTML = '<p class="text-center text-gray-400 col-span-full">No campaigns match your search.</p>';
        return;
    }
    campaigns.forEach(campaign => {
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                <img src="${campaign.image}" alt="${campaign.commodity}" class="w-full h-40 object-cover rounded-t-lg mb-4">
                <h2 class="text-2xl font-semibold text-white mb-2">${campaign.name}</h2>
                <p class="text-gray-400 mb-4">${campaign.commodity}</p>
                <p class="text-lg font-medium text-green-400 mb-4">
                    ${campaign.isFree ? 'Free' : `$${campaign.price} USD`}
                </p>
                <p class="text-gray-300">Available Codes: ${campaign.unusedCodesCount}</p>
                <button onclick="purchaseCode('${campaign._id}')"
                    class="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-colors duration-200">
                    Buy Now
                </button>
            </div>
        `;
        campaignsDiv.appendChild(div);
    });
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast p-4 mb-2 rounded-lg shadow-lg text-white animate-fade-in-out ${
        type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-yellow-500'
    }`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}