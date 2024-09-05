document.querySelector('.search-btn').addEventListener('click', function () {
    const specialty = document.querySelector('select:nth-of-type(1)').value;
    const location = document.querySelector('select:nth-of-type(2)').value;

    if (specialty && location) {
        alert(`Searching for ${specialty} specialists in ${location}`);
    } else {
        alert('Please select both specialty and location.');
    }
});

document.querySelector('.voice-btn').addEventListener('click', function () {
    alert('Voice Assistant Activated! How can I assist you?');
});


// --------------------------------------------
