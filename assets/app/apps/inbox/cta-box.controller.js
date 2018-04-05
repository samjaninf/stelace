/* global moment */

(function () {

    angular
        .module("app.inbox")
        .controller("CtaBoxController", CtaBoxController);

    function CtaBoxController($q,
                                $rootScope,
                                $scope,
                                $timeout,
                                $translate,
                                BookingService,
                                cache,
                                ContentService,
                                finance,
                                KycService,
                                ListingTypeService,
                                LocationService,
                                map,
                                Restangular,
                                pricing,
                                StelaceConfig,
                                time,
                                toastr,
                                tools,
                                uiGmapGoogleMapApi,
                                UserService,
                                usSpinnerService) {
        var listeners         = [];
        var loadIBANForm;
        var kyc;
        var bankAccounts;
        var paymentAccounts;

        var needIDNumberCountries = [
            'CA',
            'HK',
            'SG'
        ];
        var needSSNCountries = [
            'US'
        ];

        var stlConfig = StelaceConfig.getConfig();

        var vm = this;
        vm.userType              = null;
        vm.listingTypeProperties = null;
        vm.badIban               = false;
        vm.isGoogleMapSDKReady   = cache.get("isGoogleMapSDKReady") || false;
        vm.currentUser           = null;
        vm.mainLocation          = null;
        vm.bankAccount           = null;
        vm.showBankAccountForm   = false;
        vm.bankAccountActive     = false;
        vm.showBankAccountToggle = false;
        vm.showContract          = false;
        vm.contractUrl           = null;
        vm.contractTarget        = "_blank";
        vm.listingType           = null;
        vm.listingTypeProperties = {};
        vm.adultPaymentTooltip = $translate.instant('pages.booking_payment.only_adult_payment_label');
        vm.nationalityChanged   = false;
        vm.ownerNameChanged     = false;
        vm.bankAccountCountryChanged = false;
        vm.showUserTypeSwitch   = false;
        vm.info = {
            firstname: null,
            lastname: null,
            email: null,
            birthday: null,
            nationality: null,
            countryOfResidence: null,
            organizationName: null,
            organizationType: null,
            organizationEmail: null,
            organizationTaxId: null,
            ownerName: null,
            bankAccountCountry: null,
            iban: null,
            address: null,
            isNewAddress: false,
            missingAddress: false,
            addressInput: null, // used for autocomplete
            legalAddress: null,
            legalAddressInput: null,
            legalMissingAddress: false,
            socialSecurityNumberLast4: null
        };
        vm.requiredInfo = {
            firstname: false,
            lastname: false,
            email: false,
            birthday: false,
            nationality: false,
            countryOfResidence: false,
            address: false,
            legalAddress: false,
            organizationName: false,
            organizationType: false,
            organizationEmail: false,
            organizationTaxId: false,
            ownerName: false,
            bankAccountCountry: false,
            iban: false,
            socialSecurityNumberLast4: false
        };

        // Google Places ngAutocomplete options
        vm.ngAutocompleteOptions = {
            forceGlobalSearch: true
        };

        vm.onChangeUserType = onChangeUserType;
        vm.onChangeBirthday = onChangeBirthday;
        vm.onChangeCountry = onChangeCountry;
        vm.onChangeNationality = onChangeNationality;
        vm.onChangeNames = onChangeNames;
        vm.onChangeOwnerName = onChangeOwnerName;
        vm.onChangeAddress = onChangeAddress;
        vm.onChangeBankAccountCountry = onChangeBankAccountCountry;
        vm.reveal            = reveal;
        vm.accept            = accept;
        vm.afterAccept       = afterAccept;
        vm.afterReject       = afterReject;
        vm.afterMessage      = afterMessage;
        vm.createBankAccount = createBankAccount;



        activate();

        function activate() {
            $translate('booking.acceptance_deadline_message')
                .then(function (message) {
                    vm.acceptanceDeadlineMessage = message;
                });

            // conversation bookingStatus is more accurate since updated
            vm.ctaTitleKey = _getCtaTitleKey((vm.conversation && vm.conversation.bookingStatus) || vm.message.bookingStatus);

            // no booking if booking status is 'info'
            if (vm.booking) {
                vm.booking = Restangular.restangularizeElement(null, vm.booking, "booking");

                vm.paymentProvider = vm.booking.paymentProvider;

                vm.listingTypeProperties = ListingTypeService.getProperties(vm.booking.listingType);

                if (vm.booking.startDate) {
                    vm.displayStartDate = vm.booking.startDate;
                }
                if (vm.booking.endDate) {
                    vm.displayEndDate = _getDisplayEndDate(vm.booking.endDate);
                }

                var config = vm.booking.listingType.config;

                if (config.hasBookingContract) {
                    // get contract url
                    vm.booking
                        .getContractToken()
                        .then(function (res) {
                            vm.contractUrl = BookingService.getContractUrl(vm.booking.id, res.value);
                            vm.contractTarget = "sip-booking-contract_" + vm.booking.id;
                            vm.showContract = vm.message.isCtaActive;
                        });
                }

                _setBookingState();
                _setFees();
            }

            vm.validateCollapse = true; // deprecated
            vm.rejectCollapse   = true;

            loadIBANForm = vm.isOwner && vm.booking.takerPrice;

            if (loadIBANForm) {
                $q.all({
                    currentUser: UserService.getCurrentUser(),
                    myLocations: LocationService.getMine(true),
                    uiGmapGoogleMapApi: uiGmapGoogleMapApi,
                    kyc: KycService.getMine(),
                    bankAccounts: finance.getBankAccounts(),
                    paymentAccounts: UserService.getPaymentAccounts(),
                }).then(function (results) {
                    vm.isGoogleMapSDKReady = true;
                    cache.set("isGoogleMapSDKReady", true);
                    kyc = results.kyc;
                    bankAccounts = _.filter(results.bankAccounts, function (bankAccount) {
                        return bankAccount.paymentProvider === vm.paymentProvider;
                    });
                    paymentAccounts = results.paymentAccounts;

                    vm.currentUser  = results.currentUser;
                    vm.myLocations = results.myLocations;

                    vm.userType = vm.currentUser.userType || 'individual';

                    vm.showUserTypeSwitch = !stlConfig.is_internal_service;

                    // Populate account form
                    vm.hasBankAccount     = !!bankAccounts[0];
                    vm.bankAccount        = bankAccounts[0];
                    vm.bankAccountMissing = loadIBANForm && ! vm.hasBankAccount;

                    setInfo(kyc);
                    setRequiredInfo();

                    vm.showBankAccountForm = true;

                    // For now, bank account user editing is not possible
                    // Prompt user to contact our team for bank info editing only after accepting
                    vm.showBankAccountToggle = vm.hasBankAccount && !! vm.booking.acceptedDate;
                    vm.bankAccountActive     = ! vm.hasBankAccount && !! vm.booking.acceptedDate;
                });
            }

            listeners.push(
                $rootScope.$on("refreshInbox", function () {
                    _setBookingState();
                })
            );

            $scope.$on("$destroy", function () {
                _.forEach(listeners, function (listener) {
                    listener();
                });
            });

            $scope.$watch("vm.addressLocation", function (newLocation) {
                if (! newLocation || typeof newLocation !== "object") { // second condition returns false if object or null !
                    return;
                }

                map.getGooglePlaceData(newLocation)
                    .then(function (place) {
                        vm.info.isNewAddress = true;
                        vm.info.address = place;
                        onChangeAddress();
                    });
            });

            $scope.$watch("vm.legalAddressLocation", function (newLocation) {
                if (! newLocation || typeof newLocation !== "object") { // second condition returns false if object or null !
                    return;
                }

                map.getGooglePlaceData(newLocation)
                    .then(function (place) {
                        vm.info.legalAddress = place;
                    });
            });

            $scope.$watch("vm.hasBankAccount", function (newStatus, oldStatus) {
                if (oldStatus === false && newStatus === true) {
                    vm.bankAccountActive  = false;
                    vm.bankAccountMissing = false; // (loadIBANForm && ! vm.hasBankAccount)
                }
            });

        }

        function reveal(type) {
            var timeoutDuration = (vm.validateCollapse && vm.rejectCollapse ? 0 : 300);

            if (type === "validate" && vm.validateCollapse) {
                vm.rejectCollapse = true;
                $timeout(function () {
                    vm.validateCollapse = false;
                }, timeoutDuration);
            } else if (type === "reject" && vm.rejectCollapse) {
                vm.validateCollapse = true;
                $timeout(function () {
                    vm.rejectCollapse = false;
                }, timeoutDuration);
            } else if (type === "none") {
                vm.validateCollapse = true;
                vm.rejectCollapse = true;
            }
        }

        function accept() {
            if (vm.currentRequest) { // debounce
                return;
            }
            vm.currentRequest = true;

            usSpinnerService.spin('booking-validation-spinner');
            // error messages handled in the function
            vm.onAccept(vm.ctaAnswerMessage, vm.booking, vm.afterAccept);
        }

        function afterAccept(param) {
            _setBookingState();
            usSpinnerService.stop('booking-validation-spinner');
            vm.currentRequest = false;
            if (param === "missingMessage") {
                vm.missingCtaAnswerMessage = true;
            } else {
                vm.missingCtaAnswerMessage = false;
                // Allow user to contact our team only after accepting to edit bank account info
                vm.showBankAccountToggle = vm.hasBankAccount;
                vm.bankAccountActive     = ! vm.hasBankAccount;
            }
        }

        function afterReject(param) {
            _setBookingState();
            usSpinnerService.stop('booking-validation-spinner');
            vm.currentRequest = false;
            if (param === "missingMessage") {
                vm.missingCtaAnswerMessage = true;
            } else {
                vm.missingCtaAnswerMessage = false;
            }
        }

        function afterMessage(param) {
            usSpinnerService.stop('booking-validation-spinner');
            vm.currentRequest = false;
            if (param === "missingMessage") {
                vm.missingCtaAnswerMessage = true;
            } else {
                vm.missingCtaAnswerMessage = false;
                vm.ctaAnswerMessage        = null;
                vm.ctaPublicMessage        = null;
            }
        }

        function onChangeUserType() {
            setRequiredInfo();
            vm.showEmail = shouldShowEmail();
        }

        function setRequiredInfo() {
            var needSSN = false;
            var needIDCardNumber = false;
            if (vm.currentUser.address) {
                needIDCardNumber = _.includes(needIDNumberCountries, vm.currentUser.address.countryISO);
                needSSN = _.includes(needSSNCountries, vm.currentUser.address.countryISO);
            }

            if (vm.booking.paymentProvider === 'stripe') {
                vm.requiredInfo = {
                    firstname: true,
                    lastname: true,
                    email: true,
                    birthday: true,
                    nationality: false,
                    countryOfResidence: false,
                    organizationName: vm.userType === 'organization',
                    organizationType: false,
                    organizationEmail: false,
                    organizationTaxId: vm.userType === 'organization',
                    ownerName: true,
                    bankAccountCountry: true,
                    address: true,
                    legalAddress: vm.userType === 'organization',
                    socialSecurityNumberLast4: needSSN,
                    cardNumberId: needIDCardNumber
                };
            } else { // vm.booking.paymentProvider === 'mangopay'
                if (vm.userType === 'individual') {
                    vm.requiredInfo = {
                        firstname: true,
                        lastname: true,
                        email: true,
                        birthday: true,
                        nationality: true,
                        countryOfResidence: true,
                        organizationName: false,
                        organizationType: false,
                        organizationEmail: false,
                        organizationTaxId: false,
                        ownerName: true,
                        bankAccountCountry: false,
                        address: true,
                        legalAddress: false,
                        socialSecurityNumberLast4: false
                    };
                } else {
                    vm.requiredInfo = {
                        firstname: true,
                        lastname: true,
                        email: false,
                        birthday: true,
                        nationality: true,
                        countryOfResidence: true,
                        organizationName: true,
                        organizationType: true,
                        organizationEmail: true,
                        organizationTaxId: false,
                        ownerName: true,
                        bankAccountCountry: false,
                        address: true,
                        legalAddress: false,
                        socialSecurityNumberLast4: false
                    };
                }
            }
        }

        function setInfo(kyc) {
            var addressInput = vm.currentUser.address && vm.currentUser.address.name;
            var userName;
            var organizationName;
            var iban;
            var bankAccountCountry;

            if (vm.bankAccount) {
                userName = vm.bankAccount.ownerName;
            } else {
                userName = vm.currentUser.firstname || '';
                if (userName) {
                    userName += ' ';
                }
                userName += vm.currentUser.lastname || '';
            }

            if (vm.bankAccount) {
                organizationName = vm.bankAccount.ownerName;
            } else {
                organizationName = vm.currentUser.organizationName || '';
            }

            if (vm.bankAccount) {
                if (vm.bankAccount.paymentProvider === 'stripe') {
                    if (vm.bankAccount.data && vm.bankAccount.data.last4) {
                        iban = '▒▒▒▒▒▒▒▒' + vm.bankAccount.data.last4;
                    }
                    bankAccountCountry = vm.bankAccount.data.country;
                } else {
                    if (vm.bankAccount.data && vm.bankAccount.data.iban) {
                        iban = '▒▒▒▒▒▒▒▒' + vm.bankAccount.data.iban.slice(-4);
                    }
                }
            }

            if (!bankAccountCountry && vm.currentUser.address) {
                bankAccountCountry = vm.currentUser.address.countryISO;
            }

            if (vm.booking.paymentProvider === 'stripe') {
                if (vm.userType === 'individual') {
                    vm.info = {
                        firstname: vm.currentUser.firstname,
                        lastname: vm.currentUser.lastname,
                        email: vm.currentUser.email,
                        birthday: kyc.data.birthday,
                        nationality: null,
                        countryOfResidence: null,
                        organizationName: null,
                        organizationType: null,
                        organizationEmail: null,
                        organizationTaxId: null,
                        ownerName: userName,
                        bankAccountCountry: bankAccountCountry,
                        address: vm.currentUser.address,
                        addressInput: addressInput,
                        legalAddress: null,
                        iban: iban,
                        socialSecurityNumberLast4: null,
                        cardNumberId: null
                    };
                } else { // vm.userType === 'organization'
                    vm.info = {
                        firstname: kyc.data.legalRepresentativeFirstname,
                        lastname: kyc.data.legalRepresentativeLastname,
                        email: vm.currentUser.email,
                        birthday: kyc.data.legalRepresentativeBirthday,
                        nationality: null,
                        countryOfResidence: null,
                        organizationName: vm.currentUser.organizationName,
                        organizationType: null,
                        organizationEmail: kyc.data.organizationEmail,
                        organizationTaxId: kyc.data.organizationTaxId,
                        ownerName: organizationName,
                        bankAccountCountry: bankAccountCountry,
                        address: vm.currentUser.address,
                        addressInput: addressInput,
                        legalAddress: null,
                        iban: iban,
                        socialSecurityNumberLast4: null,
                        cardNumberId: null
                    };
                }
            } else {
                if (vm.userType === 'individual') {
                    vm.info = {
                        firstname: vm.currentUser.firstname,
                        lastname: vm.currentUser.lastname,
                        email: vm.currentUser.email,
                        birthday: kyc.data.birthday,
                        nationality: kyc.data.nationality,
                        countryOfResidence: kyc.data.countryOfResidence,
                        organizationName: null,
                        organizationType: null,
                        organizationEmail: null,
                        organizationTaxId: null,
                        ownerName: userName,
                        bankAccountCountry: null,
                        address: vm.currentUser.address,
                        addressInput: addressInput,
                        legalAddress: null,
                        iban: iban,
                        socialSecurityNumberLast4: null,
                        cardNumberId: null
                    };
                } else { // vm.userType === 'organization'
                    vm.info = {
                        firstname: kyc.data.legalRepresentativeFirstname,
                        lastname: kyc.data.legalRepresentativeLastname,
                        email: kyc.data.legalRepresentativeEmail,
                        birthday: kyc.data.legalRepresentativeBirthday,
                        nationality: kyc.data.legalRepresentativeNationality,
                        countryOfResidence: kyc.data.legalRepresentativeCountryOfResidence,
                        organizationName: vm.currentUser.organizationName,
                        organizationType: kyc.data.legalPersonType,
                        organizationEmail: kyc.data.organizationEmail,
                        organizationTaxId: null,
                        ownerName: organizationName,
                        bankAccountCountry: null,
                        address: vm.currentUser.address,
                        addressInput: addressInput,
                        legalAddress: null,
                        iban: iban,
                        socialSecurityNumberLast4: null,
                        cardNumberId: null
                    };
                }
            }

            vm.showEmail = shouldShowEmail();
        }

        function shouldShowEmail() {
            if (vm.userType === 'organization') {
                return false;
            }

            return !vm.currentUser.email;
        }

        function checkRequiredInfo() {
            var allValid = true;

            if (vm.requiredInfo.firstname) {
                allValid = allValid && !!vm.info.firstname;
            }
            if (vm.requiredInfo.lastname) {
                allValid = allValid && !!vm.info.lastname;
            }
            if (vm.requiredInfo.email) {
                allValid = allValid && !!vm.info.email;
            }
            if (vm.requiredInfo.birthday) {
                allValid = allValid && !!vm.info.birthday;
            }
            if (vm.requiredInfo.nationality) {
                allValid = allValid && !!vm.info.nationality;
            }
            if (vm.requiredInfo.countryOfResidence) {
                allValid = allValid && !!vm.info.countryOfResidence;
            }
            if (vm.requiredInfo.organizationName) {
                allValid = allValid && !!vm.info.organizationName;
            }
            if (vm.requiredInfo.organizationType) {
                allValid = allValid && !!vm.info.organizationType;
            }
            if (vm.requiredInfo.organizationEmail) {
                allValid = allValid && !!vm.info.organizationEmail;
            }
            if (vm.requiredInfo.organizationTaxId) {
                allValid = allValid && !!vm.info.organizationTaxId;
            }
            if (vm.requiredInfo.ownerName) {
                allValid = allValid && !!vm.info.ownerName;
            }
            if (vm.requiredInfo.bankAccountCountry) {
                allValid = allValid && !!vm.info.bankAccountCountry;
            }
            if (vm.requiredInfo.address) {
                allValid = allValid && !!vm.info.address;
            }
            if (vm.requiredInfo.legalAddress) {
                allValid = allValid && !!vm.info.legalAddress;
            }
            if (vm.requiredInfo.iban) {
                allValid = allValid && !!vm.info.iban;
            }
            if (vm.requiredInfo.socialSecurityNumberLast4) {
                allValid = allValid && !!vm.info.socialSecurityNumberLast4;
            }
            if (vm.requiredInfo.cardNumberId) {
                allValid = allValid && !!vm.info.cardNumberId;
            }

            return allValid;
        }

        function onChangeBirthday(date) {
            vm.info.birthday = date;
        }

        function onChangeCountry() {
            if (vm.nationalityChanged) return;
            vm.info.nationality = vm.info.countryOfResidence;
        }

        function onChangeNationality() {
            vm.nationalityChanged = true;
        }

        function onChangeAddress() {
            if (vm.bankAccountCountryChanged) return;
            vm.info.bankAccountCountry = vm.info.address.countryISO;

            vm.requiredInfo.cardNumberId = _.includes(needIDNumberCountries, vm.info.address.countryISO);
            vm.requiredInfo.socialSecurityNumberLast4 = _.includes(needSSNCountries, vm.info.address.countryISO);
        }

        function onChangeNames() {
            if (vm.ownerNameChanged || vm.bankAccount) return;

            if (vm.userType === 'individual') {
                vm.info.ownerName = vm.info.firstname || '';
                if (vm.info.ownerName) {
                    vm.info.ownerName += ' ';
                }
                vm.info.ownerName += vm.info.lastname || '';
            } else {
                vm.info.ownerName = vm.info.organizationName || '';
            }
        }

        function onChangeOwnerName() {
            // owner name changed only if there is a value (not initialization)
            if (!vm.info.ownerName && !vm.ownerNameChanged) {
                return;
            }

            vm.ownerNameChanged = true;
        }

        function onChangeBankAccountCountry() {
            // bank account country changed only if there is a value (not initialization)
            if (!vm.info.bankAccountCountry && !vm.bankAccountCountryChanged) {
                return;
            }

            vm.bankAccountCountryChanged = true;
        }

        function getUpdatedInfo() {
            var editingCurrentUser = Restangular.copy(vm.currentUser);
            var kycAttrs = {};

            if (vm.booking.paymentProvider === 'stripe') {
                if (vm.userType === 'individual') {
                    if (vm.info.firstname) {
                        editingCurrentUser.firstname = vm.info.firstname;
                    }
                    if (vm.info.lastname) {
                        editingCurrentUser.lastname = vm.info.lastname;
                    }
                    if (vm.info.email) {
                        editingCurrentUser.email = vm.info.email;
                    }
                    kycAttrs.birthday = vm.info.birthday;
                } else {
                    if (vm.info.firstname) {
                        kycAttrs.legalRepresentativeFirstname = vm.info.firstname;
                    }
                    if (vm.info.lastname) {
                        kycAttrs.legalRepresentativeLastname = vm.info.lastname;
                    }
                    if (vm.info.email) {
                        kycAttrs.legalRepresentativeEmail = vm.info.email;
                    }
                    if (vm.info.organizationName) {
                        editingCurrentUser.organizationName = vm.info.organizationName;
                    }
                    kycAttrs.legalRepresentativeBirthday = vm.info.birthday;
                    kycAttrs.organizationTaxId = vm.info.organizationTaxId;
                }
            } else {
                if (vm.userType === 'individual') {
                    if (vm.info.firstname) {
                        editingCurrentUser.firstname = vm.info.firstname;
                    }
                    if (vm.info.lastname) {
                        editingCurrentUser.lastname = vm.info.lastname;
                    }
                    if (vm.info.email) {
                        editingCurrentUser.email = vm.info.email;
                    }
                    kycAttrs.birthday = vm.info.birthday;
                    kycAttrs.nationality = vm.info.nationality;
                    kycAttrs.countryOfResidence = vm.info.countryOfResidence;
                } else {
                    if (vm.info.firstname) {
                        kycAttrs.legalRepresentativeFirstname = vm.info.firstname;
                    }
                    if (vm.info.lastname) {
                        kycAttrs.legalRepresentativeLastname = vm.info.lastname;
                    }
                    if (vm.info.email) {
                        kycAttrs.legalRepresentativeEmail = vm.info.email;
                    }
                    if (vm.info.organizationName) {
                        editingCurrentUser.organizationName = vm.info.organizationName;
                    }
                    kycAttrs.legalRepresentativeBirthday = vm.info.birthday;
                    kycAttrs.legalRepresentativeNationality = vm.info.nationality;
                    kycAttrs.legalRepresentativeCountryOfResidence = vm.info.countryOfResidence;
                    kycAttrs.legalPersonType = vm.info.organizationType;
                    kycAttrs.organizationEmail = vm.info.organizationEmail;
                }
            }

            editingCurrentUser.userType = vm.userType || editingCurrentUser.userType;

            return {
                editingCurrentUser: editingCurrentUser,
                kycAttrs: kycAttrs,
                address: vm.info.address
            };
        }

        function createBankAccount() {
            if (vm.currentRequest) { // debounce
                return;
            }

            var isCompleteMangopay = paymentAccounts.mangopayAccount && paymentAccounts.mangopayWallet;
            var isCompleteStripe = paymentAccounts.stripeAccount;
            var isComplete = (vm.paymentProvider === 'mangopay' && isCompleteMangopay)
                || (vm.paymentProvider === 'stripe' && isCompleteStripe);

            // Check if all needed info was provider for bank account
            if (!isComplete) {
                var isAllInfoProvided = checkRequiredInfo();

                vm.info.missingAddress = false;
                vm.info.missingLegalAddress = false;

                if (vm.requiredInfo.address && !vm.info.address) {
                    vm.info.missingAddress = true;
                }
                if (vm.requiredInfo.legalAddress && !vm.info.legalAddress) {
                    vm.info.missingLegalAddress = true;
                }

                if (!isAllInfoProvided) {
                    ContentService.showNotification({
                        messageKey: 'inbox.banking_details.notification.missing_information_message',
                        type: 'warning'
                    });
                    vm.currentRequest = false;
                    return;
                }
            }

            var updatedInfo = getUpdatedInfo();
            var editingCurrentUser = updatedInfo.editingCurrentUser;
            var kycAttrs = updatedInfo.kycAttrs;
            var address = updatedInfo.address;

            return $q.when(true)
                .then(function () {
                    usSpinnerService.spin('booking-validation-spinner');

                    var updateAttrs = [
                        "firstname",
                        "lastname",
                        "userType",
                        "organizationName"
                    ];

                    if (! _.isEqual(_.pick(editingCurrentUser, updateAttrs), _.pick(vm.currentUser, updateAttrs))) {
                        return editingCurrentUser
                            .patch()
                            .then(function (user) {
                                _.assign(vm.currentUser, _.pick(user, updateAttrs));
                            });
                    }

                    return;
                })
                .then(function () {
                    var updatingAddress = null;
                    vm.info.missingAddress = false;

                    if (vm.info.isNewAddress) {
                        updatingAddress = address;
                    } else if (! vm.currentUser.address) {
                        vm.info.missingAddress = true;
                    }

                    if (updatingAddress) {
                        return editingCurrentUser
                            .updateAddress(updatingAddress)
                            .then(function () {
                                vm.info.isNewAddress = false;
                                vm.currentUser.address = updatingAddress;

                                // if the user has no locations, add it
                                if (! vm.myLocations.length) {
                                    // no error handling
                                    LocationService
                                        .post(_.omit(updatingAddress, ["id"]))
                                        .then(function (newLocation) {
                                            LocationService.add(newLocation);
                                            vm.myLocations.push(newLocation);
                                        });
                                }
                            })
                            .catch(function (err) {
                                ContentService.showNotification({
                                    messageKey: 'inbox.banking_details.notification.incorrect_location_message',
                                    type: 'warning'
                                });
                                return $q.reject(err);
                            });
                    } else if (vm.info.missingAddress) {
                        ContentService.showNotification({
                            messageKey: 'inbox.banking_details.notification.missing_location_message',
                            type: 'warning'
                        });
                        return $q.reject("no address");
                    } else {
                        return;
                    }
                })
                .then(function () {
                    return KycService
                    .updateKyc(kyc, kycAttrs)
                    .then(function (newKyc) {
                        kyc = newKyc;

                        if (isComplete) return;

                        if (vm.paymentProvider === 'mangopay') {
                            return finance.createAccount({ paymentProvider: vm.paymentProvider })
                                .then(function (user) {
                                    vm.currentUser.canChangeUserType = user.canChangeUserType;
                                });
                        } else if (vm.paymentProvider === 'stripe') {
                            var parsedBirthday = time.parseDate(vm.info.birthday);

                            var accountAttrs = {
                                legal_entity: {
                                    first_name: vm.info.firstname,
                                    last_name: vm.info.lastname,
                                    dob: {
                                        day: parsedBirthday.day,
                                        month: parsedBirthday.month,
                                        year: parsedBirthday.year
                                    },
                                    address: {
                                        line1: vm.currentUser.address.name,
                                        city: vm.currentUser.address.city,
                                        state: vm.currentUser.address.region,
                                        postal_code: vm.currentUser.address.postalCode,
                                        country: vm.currentUser.address.countryISO
                                    },
                                },
                                tos_shown_and_accepted: true
                            };

                            if (vm.userType === 'organization') {
                                if (vm.requiredInfo.cardNumberId) {
                                    accountAttrs.personal_id_number.ssn_last_4 = vm.info.cardNumberId;
                                }
                                if (vm.requiredInfo.socialSecurityNumberLast4) {
                                    accountAttrs.legal_entity.ssn_last_4 = vm.info.socialSecurityNumberLast4;
                                }

                                accountAttrs.legal_entity.business_name = vm.info.organizationName;
                                accountAttrs.legal_entity.business_tax_id = vm.info.organizationTaxId;

                                accountAttrs.legal_entity.personal_address = {
                                    line1: vm.info.legalAddress.name,
                                    city: vm.info.legalAddress.city,
                                    state: vm.info.legalAddress.region,
                                    postal_code: vm.info.legalAddress.postalCode,
                                    country: vm.info.legalAddress.countryISO
                                };

                                accountAttrs.legal_entity.additional_owners = [];
                            }

                            return finance.createStripeAccountToken(accountAttrs)
                            .then(function (res) {
                                return finance.createAccount({
                                    accountToken: res.token.id,
                                    accountType: 'account',
                                    country: vm.currentUser.address.countryISO,
                                    paymentProvider: vm.paymentProvider
                                })
                                .then(function (user) {
                                    vm.currentUser.canChangeUserType = user.canChangeUserType;
                                });
                            });
                        }
                    })
                    .catch(function (err) {
                        ContentService.showError(err);
                        return $q.reject(err);
                    });
                })
                .then(function () {
                    if (vm.hasBankAccount) {
                        return ContentService.showSaved();
                    }

                    if (! vm.info.iban) {
                        ContentService.showNotification({
                            messageKey: 'inbox.banking_details.notification.missing_iban_message',
                            type: 'warning'
                        });
                        vm.badIban = true;
                        return $q.reject("no iban");
                    }

                    if (vm.paymentProvider === 'mangopay') {
                        var createBankAccountAttrs = {
                            ownerName: vm.info.ownerName,
                            ownerAddress: {
                                AddressLine1: vm.currentUser.address.name,
                                City: vm.currentUser.address.city,
                                PostalCode: vm.currentUser.address.postalCode,
                                Region: vm.currentUser.address.region,
                                Country: vm.currentUser.address.countryISO
                            },
                            iban: vm.info.iban,
                            paymentProvider: vm.booking.paymentProvider
                        };

                        return finance.createBankAccount(createBankAccountAttrs)
                            .then(_afterBankAccountCreationSuccess)
                            .catch(_afterBankAccountCreationFail);
                    } else if (vm.paymentProvider === 'stripe') {
                        var accountHolderType = vm.currentUser.userType === 'individual' ? 'individual' : 'company';

                        return finance.createStripeBankAccountToken({
                            country: vm.currentUser.address.countryISO,
                            currency: stlConfig.currency, // handle other currencies via UI
                            routing_number: undefined,
                            account_number: vm.info.iban,
                            account_holder_name: vm.info.ownerName,
                            account_holder_type: accountHolderType
                        })
                        .then(function (res) {
                            return finance.createBankAccount({
                                accountToken: res.token.id,
                                paymentProvider: vm.booking.paymentProvider
                            });
                        })
                        .then(_afterBankAccountCreationSuccess)
                        .catch(_afterBankAccountCreationFail);
                    }
                })
                .finally(function () {
                    usSpinnerService.stop('booking-validation-spinner');
                    vm.currentRequest = false;
                });
        }

        function _afterBankAccountCreationSuccess() {
            vm.hasBankAccount        = true;
            vm.bankAccountActive     = false;
            vm.showBankAccountToggle = true;
            vm.ctaTitleKey = _getCtaTitleKey();

            ContentService.showNotification({
                titleKey: 'inbox.banking_details.notification.success_title',
                messageKey: 'inbox.banking_details.notification.success_message',
                type: 'success'
            });
        }

        function _afterBankAccountCreationFail(err) {
            ContentService.showNotification({
                messageKey: 'inbox.banking_details.notification.iban_error_message',
                type: 'warning'
            });
            vm.badIban = true;
            return $q.reject(err);
        }

        function _setBookingState() {
            if (! vm.booking) {
                return;
            }

            if (vm.booking.cancellationId) {
                vm.bookingState = "cancelled";
            } else if (! vm.message.isCtaActive) {
                vm.bookingState = "updated";
            } else if (vm.booking.acceptedDate && vm.booking.paidDate) {
                vm.bookingState = "paidAndValidated";
            } else if (vm.booking.paidDate) {
                vm.bookingState = "paid";
            } else if (vm.booking.acceptedDate) {
                vm.bookingState = "validated";
            }
        }

        function _getCtaTitleKey(bookingStatus) {
            var needPaymentDetails = vm.booking && vm.booking.acceptedDate && vm.isOwner && ! vm.hasBankAccount;
            if (needPaymentDetails) {
                return 'booking.summary_title.information_required';
            }

            switch (bookingStatus) {
                case "info":
                case "pre-booking":
                    return 'booking.summary_title.request_for_information';

                default:
                    return 'booking.summary_title.booking_request';
            }
        }

        function _setFees() {
            var priceResult = pricing.getPriceAfterRebateAndFees({ booking: vm.booking });

            vm.listingBasePrice = priceResult.ownerPriceAfterRebate;
            vm.ownerNetIncome  = priceResult.ownerNetIncome;
        }

        function _getDisplayEndDate(date) {
            return moment(date).add({ d: -1 }).format('YYYY-MM-DD') + 'T00:00:00.000Z';
        }
    }

})();
