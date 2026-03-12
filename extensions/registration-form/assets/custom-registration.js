// Custom Registration Form Handler
(function () {
    'use strict';

    const PENDING_MESSAGE_KEY = 'pendingApprovalMessage';

    // Show pending approval message after registration
    function showPendingMessage() {
        const message = sessionStorage.getItem(PENDING_MESSAGE_KEY);

        if (message && window.location.pathname.includes('/account/register')) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'custom-approval-message';
            messageDiv.innerHTML = `
        <div class="approval-message-content">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <p>${message}</p>
        </div>
      `;

            document.body.insertBefore(messageDiv, document.body.firstChild);
            sessionStorage.removeItem(PENDING_MESSAGE_KEY);

            // Auto-hide after 10 seconds
            setTimeout(() => {
                messageDiv.style.opacity = '0';
                setTimeout(() => messageDiv.remove(), 300);
            }, 10000);
        }
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showPendingMessage);
    } else {
        showPendingMessage();
    }
})();
