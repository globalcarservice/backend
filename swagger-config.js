const swaggerJsDoc = require('swagger-jsdoc');

const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'Auto Service API',
            version: '1.0.0',
            description: 'API documentation for the Auto Service application',
            contact: {
                name: 'Support',
                email: 'support@example.com',
            },
        },
        servers: [
            {
                url: 'http://127.0.0.1:3000',
            },
        ],
    },
    apis: ['./server.js'], // Point to your main server file for route annotations
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
module.exports = swaggerDocs;
